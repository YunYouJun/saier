import type { Container, FederatedPointerEvent, Sprite } from 'pixi.js'
import type { Painter } from '../src'
import { Point, Rectangle } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush } from '../src'

const painters: Painter[] = []
afterEach(() => {
  for (const p of painters.splice(0))
    p.destroy()
  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
})

async function fixture(): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend: 'rendertexture',
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: { backgroundAlpha: 0 },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(painter: Painter, x: number, y: number, t = 0): FederatedPointerEvent {
  const board = painter.board.container
  const global = new Point(board.position.x + x * board.scale.x, board.position.y + y * board.scale.y)
  return { global, pressure: 1, timeStamp: t, pointerId: 1, pointerType: 'pen' } as unknown as FederatedPointerEvent
}

function previewSprite(painter: Painter): Sprite {
  const sprite = painter.canvas.layersContainer.children.find(
    child => child.label === 'saier-stroke-preview',
  )
  if (!sprite)
    throw new Error('missing stroke preview sprite')
  return sprite as Sprite
}

function maxAlphaInRegion(painter: Painter, target: Container | Sprite): number {
  const { pixels } = painter.app.renderer.extract.pixels({
    target,
    frame: new Rectangle(0, 0, 64, 64),
  })
  let max = 0
  for (let o = 3; o < pixels.length; o += 4)
    max = Math.max(max, pixels[o]!)
  return max
}

describe('cpu brush live preview', () => {
  it('shows an in-stroke preview for the marker (CPU-rasterized) brush', async () => {
    const painter = await fixture()
    painter.useTool('brush')
    painter.brush.setPreset('marker')
    painter.brush.setSize(16)

    // Press + move, but do NOT lift the pointer yet.
    painter.brush.pointerDown(eventAt(painter, -8, 0, 0))
    painter.brush.pointerMove(eventAt(painter, 8, 0, 1))
    painter.flushSurfaceUploads()

    // Before the fix, CPU brushes only rasterized at endStroke, so the live
    // preview RT stayed empty during the stroke.
    expect(maxAlphaInRegion(painter, previewSprite(painter))).toBeGreaterThan(0)

    painter.brush.pointerUp(eventAt(painter, 8, 0, 2))
  })
})
