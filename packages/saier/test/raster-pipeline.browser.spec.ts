import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter } from '../src'
import { PixiTileTextureBackend } from '@saier/pixi'
import { Container, Graphics, Point, Rectangle, Sprite } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush, PainterEraser } from '../src'

const painters: Painter[] = []

// PainterBrush / PainterEraser keep mutable static state that is shared across
// the whole browser suite. Reset every field after each test so ordering can
// never leak (e.g. a tool/drag flip leaving `enabled = false` for the next spec).
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
  PainterEraser.stabilizerStrength = 1
})

async function createFixture(backend: 'rendertexture' | 'tiled' = 'rendertexture'): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend,
    view: canvas,
    size: { width: 64, height: 64 },
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
      throw new Error('Brush tests must derive local coordinates from event.global')
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
  const { pixels } = painter.app.renderer.extract.pixels({
    target: layerTarget(painter),
    frame: new Rectangle(x, y, 1, 1),
  })

  return new Uint8Array(pixels)
}

function readLayerPixels(painter: Painter): Uint8Array {
  const { pixels } = painter.app.renderer.extract.pixels({
    target: layerTarget(painter),
    frame: new Rectangle(0, 0, 64, 64),
  })

  return new Uint8Array(pixels)
}

function drawBrushStroke(painter: Painter, color: number | string = 0x000000): void {
  painter.useTool('brush')
  painter.brush.setColor(color)
  painter.brush.setSize(20)
  painter.brush.pointerDown(eventAt(painter, 0, 0, 0))
  painter.brush.pointerMove(eventAt(painter, 8, 0, 1))
  painter.brush.pointerUp(eventAt(painter, 8, 0, 2))
  painter.flushSurfaceUploads()
}

function drawEraseStroke(painter: Painter): void {
  painter.useTool('eraser')
  painter.eraser.pointerDown(eventAt(painter, 0, 0, 3))
  painter.eraser.pointerMove(eventAt(painter, 4, 0, 4))
  painter.eraser.pointerUp(eventAt(painter, 4, 0, 5))
  painter.flushSurfaceUploads()
}

async function readExportCenterPixel(painter: Painter): Promise<Uint8ClampedArray> {
  const canvas = await painter.extractCanvas('canvas') as HTMLCanvasElement
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('missing 2d context')
  return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data
}

describe('saier raster pipeline', () => {
  it('paints into RenderTexture layers without adding stroke Graphics', async () => {
    const painter = await createFixture()
    const childCount = painter.canvas.layersContainer.children.length

    drawBrushStroke(painter)
    const afterBrush = readPixel(painter, 32, 32)

    expect(afterBrush[3]).toBeGreaterThan(0)
    expect(painter.canvas.layersContainer.children.length).toBe(childCount)
    expect(painter.canvas.layersContainer.children.some(child => child instanceof Graphics))
      .toBe(false)
  })

  it('erases transparent pixels and round-trips through public history', async () => {
    const painter = await createFixture()
    const childCount = painter.canvas.layersContainer.children.length

    drawBrushStroke(painter)
    drawEraseStroke(painter)
    const erased = readPixel(painter, 32, 32)

    expect(erased[3]).toBe(0)
    expect(painter.canvas.layersContainer.children.length).toBe(childCount)

    painter.history.undo()
    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)

    painter.history.redo()
    expect(readPixel(painter, 32, 32)[3]).toBe(0)
  })

  it('renders deterministic pixels for identical input strokes', async () => {
    const first = await createFixture()
    const second = await createFixture()

    drawBrushStroke(first)
    drawBrushStroke(second)

    expect(readLayerPixels(first)).toEqual(readLayerPixels(second))
  })

  it('applies custom stabilizer strength to brush and eraser', async () => {
    const painter = await createFixture()

    painter.brush.setStabilizerStrength(6)
    painter.eraser.setStabilizerStrength(3)

    expect(PainterBrush.stabilizerStrength).toBe(6)
    expect(PainterEraser.stabilizerStrength).toBe(3)
    expect(painter.brush.createStabilizer().strength).toBe(6)
    expect(painter.eraser.createStabilizer().strength).toBe(3)
  })

  it('paints the first dab under the pointer after board transforms', async () => {
    const painter = await createFixture()
    painter.board.container.position.set(19, 43)
    painter.board.container.scale.set(1.75)

    painter.useTool('brush')
    painter.brush.setSize(20)
    painter.brush.pointerDown(eventAt(painter, 9, -11, 0))
    painter.brush.pointerUp(eventAt(painter, 9, -11, 1))
    painter.flushSurfaceUploads()
    painter.board.resetToCenter()

    const painted = readPixel(painter, 41, 21)
    expect(painted[3]).toBeGreaterThan(0)
  })

  it('aligns RenderTexture stroke preview with the centered layer display', async () => {
    const painter = await createFixture()
    const layerId = painter.document.activeLayerId
    if (!layerId)
      throw new Error('missing active layer')
    const layer = painter.surface.getDisplayHandle(layerId)
    if (!(layer instanceof Sprite))
      throw new TypeError('expected RenderTexture layer sprite')

    painter.useTool('brush')
    painter.brush.setSize(20)
    painter.brush.pointerDown(eventAt(painter, 0, 0, 0))

    const preview = painter.canvas.layersContainer.children.find(
      child => child.label === 'saier-stroke-preview',
    )
    if (!(preview instanceof Sprite))
      throw new TypeError('missing RenderTexture stroke preview sprite')

    expect(preview.position.x).toBe(layer.position.x)
    expect(preview.position.y).toBe(layer.position.y)
    painter.brush.pointerUp(eventAt(painter, 0, 0, 1))
  })

  it('keeps P1 paint/erase/history parity on the tiled backend', async () => {
    const painter = await createFixture('tiled')
    const childCount = painter.canvas.layersContainer.children.length

    drawBrushStroke(painter)
    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)
    expect(painter.canvas.layersContainer.children.length).toBe(childCount)

    drawEraseStroke(painter)
    expect(readPixel(painter, 32, 32)[3]).toBe(0)

    painter.history.undo()
    painter.flushSurfaceUploads()
    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)

    painter.history.redo()
    painter.flushSurfaceUploads()
    expect(readPixel(painter, 32, 32)[3]).toBe(0)
  })

  it('syncs controller layer commands to display state and export', async () => {
    const painter = await createFixture()
    const redId = painter.document.activeLayerId
    if (!redId)
      throw new Error('missing default layer')

    drawBrushStroke(painter, '#ff0000')
    const blue = painter.controller.layer.add({ id: 'blue', label: 'Blue' })
    drawBrushStroke(painter, '#0000ff')

    let center = await readExportCenterPixel(painter)
    expect(center[2]).toBeGreaterThan(center[0])

    painter.controller.layer.move(blue.id, 0)
    center = await readExportCenterPixel(painter)
    expect(center[0]).toBeGreaterThan(center[2])

    painter.controller.layer.setVisible(redId, false)
    center = await readExportCenterPixel(painter)
    expect(center[2]).toBeGreaterThan(center[0])

    painter.controller.layer.setVisible(redId, true)
    painter.controller.layer.setOpacity(redId, 0.5)
    center = await readExportCenterPixel(painter)
    expect(center[0]).toBeGreaterThan(80)
    expect(center[2]).toBeGreaterThan(80)

    await expect(painter.extractLayerThumbnail(blue.id, 16))
      .resolves
      .toMatch(/^data:image\/png;base64,/)
  })

  it('reports painter memory snapshots for RenderTexture and tiled backends', async () => {
    const renderTexturePainter = await createFixture()
    drawBrushStroke(renderTexturePainter)

    const renderTextureMemory = renderTexturePainter.getMemorySnapshot()
    expect(renderTextureMemory.surface.source).toBe('rendertexture')
    expect(renderTextureMemory.surface.totalEstimatedBytes).toBe(64 * 64 * 4 * 2)
    expect(renderTextureMemory.undo.undoCount).toBe(1)
    expect(renderTextureMemory.totalEstimatedBytes).toBe(
      renderTextureMemory.surface.totalEstimatedBytes + renderTextureMemory.undo.totalEstimatedBytes,
    )
    expect(renderTextureMemory.riskLevel).toBe('normal')

    const tiledPainter = await createFixture('tiled')
    drawBrushStroke(tiledPainter)

    const tiledMemory = tiledPainter.getMemorySnapshot()
    expect(tiledMemory.surface.source).toBe('tiled')
    expect(tiledMemory.surface.totalEstimatedBytes).toBeGreaterThan(0)
    expect(tiledMemory.undo.undoCount).toBe(1)
    expect(tiledMemory.totalEstimatedBytes).toBe(
      tiledMemory.surface.totalEstimatedBytes + tiledMemory.undo.totalEstimatedBytes,
    )
  })

  it('keeps tiled backend memory sparse on a 4096 canvas', async () => {
    const canvas = document.createElement('canvas')
    const painter = createPainter({
      backend: 'tiled',
      view: canvas,
      size: { width: 128, height: 128 },
      boardSize: { width: 4096, height: 4096 },
      pixiOptions: {
        backgroundAlpha: 0,
      },
    })
    await painter.init()
    painters.push(painter)

    painter.useTool('brush')
    painter.brush.setSize(32)
    painter.brush.pointerDown(eventAt(painter, 0, 0, 0))
    for (let i = 0; i < 200; i++)
      painter.brush.pointerMove(eventAt(painter, i % 32, Math.floor(i / 32), i + 1))
    painter.brush.pointerUp(eventAt(painter, 31, 6, 202))
    painter.flushSurfaceUploads()

    const layerId = painter.document.activeLayerId
    if (!layerId || !(painter.surface instanceof PixiTileTextureBackend))
      throw new Error('expected tiled backend')

    const surface = painter.surface.getSurface(layerId)
    expect(surface.allocatedTileCount).toBeLessThanOrEqual(4)

    const snapshot = painter.getMemorySnapshot()
    expect(snapshot.surface.metadata).toMatchObject({
      allocatedTileCount: surface.allocatedTileCount,
    })
    expect(snapshot.surface.totalEstimatedBytes).toBeLessThanOrEqual(
      surface.allocatedTileCount * 256 * 256 * 4 * 2,
    )
  })
})
