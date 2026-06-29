import type { FederatedPointerEvent, Sprite } from 'pixi.js'
import type { Painter } from '../src'
import { createLayerTransform, documentToLayer } from '@saier/core'
import { Point } from 'pixi.js'
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

/** A pointer event whose document-space target is (`docX`, `docY`). */
function eventAtDoc(p: Painter, docX: number, docY: number, t = 0): FederatedPointerEvent {
  const b = p.board.container
  // brush maps global -> layersContainer.toLocal -> + (w/2,h/2) = document point.
  // For the default board, eventAt(x,y) lands at document (x + w/2, y + h/2).
  const x = docX - 32
  const y = docY - 32
  const global = new Point(b.position.x + x * b.scale.x, b.position.y + y * b.scale.y)
  return { global, pressure: 1, timeStamp: t, pointerId: 1, pointerType: 'pen' } as unknown as FederatedPointerEvent
}

/**
 * Alpha-weighted centroid of painted pixels in the layer's local RT. Reads the
 * sprite's TEXTURE (raw layer-local pixels) rather than the sprite itself, whose
 * display transform would otherwise warp the readback.
 */
function paintedCentroid(p: Painter, layerId: string): { x: number, y: number, n: number } {
  const handle = p.surface.getDisplayHandle(layerId) as Sprite
  const { pixels } = p.app.renderer.extract.pixels({ target: handle.texture })
  let sx = 0
  let sy = 0
  let sw = 0
  for (let i = 0; i < 64 * 64; i++) {
    const a = pixels[i * 4 + 3]!
    if (a > 0) {
      sx += (i % 64) * a
      sy += Math.floor(i / 64) * a
      sw += a
    }
  }
  return { x: sx / sw, y: sy / sw, n: sw }
}

/**
 * Draw a short back-and-forth stroke centred on (docX, docY). Movement is
 * required so the engine emits full-radius dabs (a zero-length tap only yields
 * tiny taper dabs); the symmetric path keeps the painted centroid at the centre.
 */
function paintDot(p: Painter, docX: number, docY: number): void {
  p.useTool('brush')
  p.brush.setColor(0x000000)
  p.brush.setSize(12)
  p.brush.pointerDown(eventAtDoc(p, docX - 4, docY, 0))
  p.brush.pointerMove(eventAtDoc(p, docX, docY, 1))
  p.brush.pointerMove(eventAtDoc(p, docX + 4, docY, 2))
  p.brush.pointerMove(eventAtDoc(p, docX, docY, 3))
  p.brush.pointerUp(eventAtDoc(p, docX, docY, 4))
  p.flushSurfaceUploads()
}

describe('painting on a transformed layer (P6-05)', () => {
  it('lands the dab at documentToLayer(point) on a scaled + rotated + translated layer', async () => {
    const p = await fixture()
    const layerId = p.document.activeLayerId!
    const transform = createLayerTransform({ x: 19, y: 43, scaleX: 1.75, scaleY: 1.75, rotation: 0.4, anchorX: 32, anchorY: 32 })
    p.controller.layer.setTransform(layerId, transform)

    const D = { x: 40, y: 20 }
    paintDot(p, D.x, D.y)

    const expected = documentToLayer(D, transform)
    const c = paintedCentroid(p, layerId)
    expect(c.n).toBeGreaterThan(0)
    expect(Math.abs(c.x - expected.x)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(c.y - expected.y)).toBeLessThanOrEqual(1.5)
  })

  it('keeps identity layers painting at the document point (zero regression)', async () => {
    const p = await fixture()
    const layerId = p.document.activeLayerId!

    const D = { x: 44, y: 24 }
    paintDot(p, D.x, D.y)

    const c = paintedCentroid(p, layerId)
    // identity ⇒ documentToLayer(D) === D
    expect(Math.abs(c.x - D.x)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(c.y - D.y)).toBeLessThanOrEqual(1.5)
  })

  it('is deterministic: same input + transform replays identical layer pixels', async () => {
    const transform = createLayerTransform({ x: 19, y: 43, scaleX: 1.6, scaleY: 1.6, rotation: 0.3, anchorX: 32, anchorY: 32 })

    async function run(): Promise<Uint8Array> {
      const p = await fixture()
      const layerId = p.document.activeLayerId!
      p.controller.layer.setTransform(layerId, transform)
      paintDot(p, 40, 20)
      const handle = p.surface.getDisplayHandle(layerId) as Sprite
      const { pixels } = p.app.renderer.extract.pixels({ target: handle.texture })
      return new Uint8Array(pixels)
    }

    expect(await run()).toEqual(await run())
  })

  it('applies the forward transform to the layer display handle', async () => {
    const p = await fixture()
    const layerId = p.document.activeLayerId!
    const transform = createLayerTransform({ x: 19, y: 43, scaleX: 1.75, scaleY: 1.25, rotation: 0.4, anchorX: 32, anchorY: 32 })
    p.controller.layer.setTransform(layerId, transform)

    const handle = p.surface.getDisplayHandle(layerId) as Sprite
    expect(handle.scale.x).toBeCloseTo(1.75, 5)
    expect(handle.scale.y).toBeCloseTo(1.25, 5)
    expect(handle.rotation).toBeCloseTo(0.4, 5)
    expect(handle.pivot.x).toBeCloseTo(32, 5)
    expect(handle.pivot.y).toBeCloseTo(32, 5)
    // position is the document translate offset by the centering (-w/2,-h/2)
    expect(handle.position.x).toBeCloseTo(19 - 32, 5)
    expect(handle.position.y).toBeCloseTo(43 - 32, 5)
  })
})
