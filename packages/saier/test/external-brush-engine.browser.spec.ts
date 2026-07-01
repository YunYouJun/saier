import type { BrushContext, BrushDab, BrushEngine, BrushInputPoint, BrushPreset } from '@saier/core'
import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter } from '../src'
import { Container, Point, Rectangle, Sprite } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush } from '../src'

const painters: Painter[] = []

afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()

  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
  PainterBrush.presetId = 'pen'
  PainterBrush.enablePressure = true
  PainterBrush.stabilizerStrength = 1
})

class ExternalDabEngine implements BrushEngine {
  private ctx: BrushContext | null = null

  beginStroke(ctx: BrushContext): void {
    this.ctx = ctx
  }

  addPoint(point: BrushInputPoint): BrushDab[] {
    if (!this.ctx)
      throw new Error('ExternalDabEngine.addPoint called before beginStroke')

    return [{
      x: point.x,
      y: point.y,
      radius: this.ctx.baseSize / 2,
      opacity: 1,
      color: this.ctx.color,
      hardness: 0,
      tipId: 'external-dab',
    }]
  }

  endStroke(): BrushDab[] {
    return []
  }
}

const EXTERNAL_PRESET: BrushPreset = {
  id: 'external-dab',
  name: 'External Dab',
  engine: 'external-dab-engine',
  tipId: 'external-dab',
  size: 18,
  opacity: 1,
  spacing: 0.25,
  hardness: 0,
}

async function fixture(): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend: 'rendertexture',
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: { backgroundAlpha: 0 },
    brushPresets: [EXTERNAL_PRESET],
    brushEngines: [{
      id: 'external-dab-engine',
      label: 'External Dab Engine',
      experimental: true,
      create: () => new ExternalDabEngine(),
    }],
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(painter: Painter, x: number, y: number, timeStamp: number): FederatedPointerEvent {
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

describe('p9 external brush engines', () => {
  it('paints through a registered external BrushEngine factory', async () => {
    const painter = await fixture()

    painter.useTool('brush')
    painter.brush.setPreset('external-dab')
    painter.brush.setColor(0xFF0000)
    painter.brush.setSize(18)
    painter.brush.pointerDown(eventAt(painter, 0, 0, 0))
    painter.brush.pointerUp(eventAt(painter, 0, 0, 1))
    painter.flushSurfaceUploads()

    const center = readPixel(painter, 32, 32)
    expect(center[0]).toBeGreaterThan(0)
    expect(center[3]).toBeGreaterThan(0)
  })

  it('creates a custom brush preset from current settings and paints with it', async () => {
    const painter = await fixture()

    painter.useTool('brush')
    painter.brush.setPreset('pen')
    painter.brush.setSize(22)
    painter.brush.setOpacity(0.7)

    const custom = painter.brush.createCustomPreset({
      name: 'Browser Custom',
      group: 'Custom',
      select: true,
    })

    expect(custom).toMatchObject({
      id: 'custom-browser-custom',
      custom: true,
      size: 22,
      opacity: 0.7,
    })
    expect(painter.controller.getState().brush.presetId).toBe(custom.id)

    painter.brush.setColor(0xFF0000)
    painter.brush.pointerDown(eventAt(painter, 0, 0, 2))
    painter.brush.pointerUp(eventAt(painter, 0, 0, 3))
    painter.flushSurfaceUploads()

    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)
    expect(painter.brush.removePreset(custom.id)).toBe(true)
    expect(painter.controller.getState().brush.presetId).toBe('pen')
  })
})
