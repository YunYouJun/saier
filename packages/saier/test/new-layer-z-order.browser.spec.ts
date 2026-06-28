import type { Container, FederatedPointerEvent, Sprite } from 'pixi.js'
import type { Painter } from '../src'
import { Graphics, Point, Rectangle } from 'pixi.js'
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
  const painter = createPainter({ view: canvas, size: { width: 64, height: 64 }, boardSize: { width: 64, height: 64 }, pixiOptions: { backgroundAlpha: 0 } })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(p: Painter, x: number, y: number, t = 0): FederatedPointerEvent {
  const b = p.board.container
  return { global: new Point(b.position.x + x * b.scale.x, b.position.y + y * b.scale.y), pressure: 1, timeStamp: t, pointerId: 1, pointerType: 'pen' } as unknown as FederatedPointerEvent
}

function stroke(p: Painter, t: number): void {
  p.useTool('brush')
  p.brush.setColor(0x000000)
  p.brush.setSize(20)
  p.brush.pointerDown(eventAt(p, 0, 0, t))
  p.brush.pointerMove(eventAt(p, 4, 0, t + 1))
  p.brush.pointerUp(eventAt(p, 4, 0, t + 2))
  p.flushSurfaceUploads()
}

describe('new layer z-order with foreign children (e.g. imported image)', () => {
  it('stacks a newly added raster layer above a foreign child so its strokes are not hidden', async () => {
    const p = await fixture()

    // Simulate `loadImage`: a foreign opaque child added to the same container
    // that holds raster-layer sprites, on top of the default layer.
    const container = p.canvas.layersContainer
    const foreign = new Graphics().rect(0, 0, 64, 64).fill(0xFFFFFF)
    foreign.label = 'foreign-image'
    container.addChild(foreign)

    // Add a raster layer (this triggers the surface reorder).
    const added = p.controller.layer.add({ id: 'layer-2', label: 'Layer 2' })
    const sprite = p.surface.getDisplayHandle(added.id) as Container | Sprite

    // The new raster layer must render ABOVE the foreign child.
    expect(container.getChildIndex(sprite)).toBeGreaterThan(container.getChildIndex(foreign))

    // And its committed stroke must survive pen-up (be visible, not hidden).
    stroke(p, 0)
    const { pixels } = p.app.renderer.extract.pixels({ target: sprite, frame: new Rectangle(32, 32, 1, 1) })
    expect(pixels[3]!).toBeGreaterThan(0)
  })
})
