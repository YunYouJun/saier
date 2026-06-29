import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter } from '../src'
import { Container, Point, Rectangle, Sprite } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush, PainterEraser } from '../src'

const painters: Painter[] = []

afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()
  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
  PainterBrush.enablePressure = true
  PainterBrush.stabilizerStrength = 1
  PainterEraser.enabled = true
  PainterEraser.size = 10
})

async function createFixture(): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend: 'rendertexture',
    view: canvas,
    size: { width: 160, height: 120 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: {
      backgroundAlpha: 0,
    },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(painter: Painter, x: number, y: number, timeStamp = 0): FederatedPointerEvent {
  const board = painter.board.container
  const global = new Point(
    board.position.x + x * board.scale.x,
    board.position.y + y * board.scale.y,
  )
  return {
    global,
    pressure: 1,
    timeStamp,
    pointerId: 1,
    pointerType: 'pen',
    getLocalPosition: () => {
      throw new Error('Document session tests must derive local coordinates from event.global')
    },
  } as unknown as FederatedPointerEvent
}

function layerTarget(painter: Painter): Container | Sprite {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')
  const handle = painter.surface.getDisplayHandle(layerId)
  if (handle instanceof Container || handle instanceof Sprite)
    return handle
  throw new TypeError('unsupported display handle')
}

function readPixel(painter: Painter, x: number, y: number): Uint8Array {
  painter.flushSurfaceUploads()
  const { pixels } = painter.app.renderer.extract.pixels({
    target: layerTarget(painter),
    frame: new Rectangle(x, y, 1, 1),
  })

  return new Uint8Array(pixels)
}

function drawBrushStroke(painter: Painter, color: number | string): void {
  painter.useTool('brush')
  painter.brush.setColor(color)
  painter.brush.setSize(18)
  painter.brush.pointerDown(eventAt(painter, 0, 0, 0))
  painter.brush.pointerMove(eventAt(painter, 4, 0, 1))
  painter.brush.pointerUp(eventAt(painter, 4, 0, 2))
  painter.flushSurfaceUploads()
}

describe('painter document sessions', () => {
  it('creates canvases with independent dimensions and active state', async () => {
    const painter = await createFixture()
    const firstId = painter.getActiveDocumentId()

    expect(painter.document.width).toBe(64)
    expect(painter.document.height).toBe(64)

    painter.createDocument({
      name: 'Wide',
      width: 128,
      height: 96,
      defaultLayerLabel: 'Layer 1',
    })

    expect(painter.getDocuments()).toEqual([
      expect.objectContaining({ id: firstId, width: 64, height: 64, active: false }),
      expect.objectContaining({ name: 'Wide', width: 128, height: 96, active: true }),
    ])
    expect(painter.document.width).toBe(128)
    expect(painter.document.height).toBe(96)

    painter.switchDocument(firstId)
    expect(painter.document.width).toBe(64)
    expect(painter.document.height).toBe(64)
  })

  it('keeps pixels isolated while switching between files', async () => {
    const painter = await createFixture()
    const firstId = painter.getActiveDocumentId()
    drawBrushStroke(painter, '#ff0000')

    const second = painter.createDocument({
      name: 'Blue',
      width: 128,
      height: 96,
      defaultLayerLabel: 'Layer 1',
    })
    drawBrushStroke(painter, '#0000ff')

    const secondCenter = readPixel(painter, 64, 48)
    expect(secondCenter[2]).toBeGreaterThan(secondCenter[0])

    painter.switchDocument(firstId)
    const firstCenter = readPixel(painter, 32, 32)
    expect(firstCenter[0]).toBeGreaterThan(firstCenter[2])

    painter.switchDocument(second.id)
    expect(readPixel(painter, 64, 48)[2]).toBeGreaterThan(0)
  })

  it('keeps undo and redo scoped to the active file', async () => {
    const painter = await createFixture()
    const firstId = painter.getActiveDocumentId()
    drawBrushStroke(painter, '#ff0000')

    const second = painter.createDocument({
      name: 'Blue',
      width: 128,
      height: 96,
      defaultLayerLabel: 'Layer 1',
    })
    drawBrushStroke(painter, '#0000ff')

    painter.history.undo()
    expect(readPixel(painter, 64, 48)[3]).toBe(0)

    painter.switchDocument(firstId)
    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)

    painter.switchDocument(second.id)
    painter.history.redo()
    expect(readPixel(painter, 64, 48)[3]).toBeGreaterThan(0)
  })
})
