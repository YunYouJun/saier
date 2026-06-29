import type { Container, FederatedPointerEvent, Sprite } from 'pixi.js'
import type { Painter } from '../src'
import { PixiTileTextureBackend } from '@saier/pixi'
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

type TestBackend = 'rendertexture' | 'tiled'

async function fixture(backend?: TestBackend): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({ backend, view: canvas, size: { width: 64, height: 64 }, boardSize: { width: 64, height: 64 }, pixiOptions: { backgroundAlpha: 0 } })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(p: Painter, docX: number, docY: number, t: number): FederatedPointerEvent {
  const b = p.board.container
  const global = new Point(b.position.x + (docX - 32) * b.scale.x, b.position.y + (docY - 32) * b.scale.y)
  return { global, pressure: 1, timeStamp: t, pointerId: 1, pointerType: 'pen' } as unknown as FederatedPointerEvent
}

function stroke(p: Painter, color: number, pts: Array<[number, number]>, t0: number): void {
  p.useTool('brush')
  p.brush.setColor(color)
  p.brush.setSize(16)
  p.brush.setOpacity(1)
  p.brush.pointerDown(eventAt(p, pts[0]![0], pts[0]![1], t0))
  for (let i = 1; i < pts.length; i++)
    p.brush.pointerMove(eventAt(p, pts[i]![0], pts[i]![1], t0 + i))
  p.brush.pointerUp(eventAt(p, pts[pts.length - 1]![0], pts[pts.length - 1]![1], t0 + pts.length))
  p.flushSurfaceUploads()
}

/** Read a layer's display (derived texture for clip layers) — what export sees. */
function displayPixel(p: Painter, layerId: string, x: number, y: number): Uint8Array {
  const handle = p.surface.getDisplayHandle(layerId) as Container | Sprite
  const { pixels } = p.app.renderer.extract.pixels({ target: handle, frame: new Rectangle(x, y, 1, 1) })
  return new Uint8Array(pixels)
}

describe('clipping layers (P6-03)', () => {
  it('uses the tiled backend by default', async () => {
    const p = await fixture()
    expect(p.surface).toBeInstanceOf(PixiTileTextureBackend)
  })
})

describe.each(['rendertexture', 'tiled'] as const)('clipping layers (P6-03, %s backend)', (backend) => {
  it('shows the clip layer only where the layer below is opaque', async () => {
    const p = await fixture(backend)
    const base = p.document.activeLayerId!

    // Base: vertical GREEN band on the left (x≈18), opaque.
    stroke(p, 0x00FF00, [[18, 8], [18, 32], [18, 56]], 0)

    // Clip layer on top: horizontal RED band (y≈32) spanning left→right.
    const clip = p.controller.layer.add({ id: 'clip', label: 'Clip' })
    p.controller.layer.setClip(clip.id, true)
    stroke(p, 0xFF0000, [[8, 32], [32, 32], [56, 32]], 10)

    // The clip layer's red shows only where the base (mask) is opaque.
    const onBase = displayPixel(p, clip.id, 18, 32) // base opaque here
    const offBase = displayPixel(p, clip.id, 48, 32) // base transparent here
    const dbg = `onBase=${[...onBase]} offBase=${[...offBase]}`
    expect(onBase[3], dbg).toBeGreaterThan(180)
    expect(onBase[0], dbg).toBeGreaterThan(150) // red present

    expect(offBase[3], dbg).toBe(0) // clipped away

    // The base layer itself is unaffected.
    expect(displayPixel(p, base, 18, 12)[3]).toBeGreaterThan(180)
  })

  it('degrades to a normal layer when clip is toggled off', async () => {
    const p = await fixture(backend)
    // Base green only on the left (x≈18); base is transparent at x=32.
    stroke(p, 0x00FF00, [[18, 8], [18, 32], [18, 56]], 0)
    const clip = p.controller.layer.add({ id: 'clip', label: 'Clip' })
    p.controller.layer.setClip(clip.id, true)
    stroke(p, 0xFF0000, [[8, 32], [32, 32], [56, 32]], 10)

    // Clipped: at (32,32) the base is transparent → clip hidden there.
    expect(displayPixel(p, clip.id, 32, 32)[3]).toBe(0)

    // Toggle clip off → the clip layer's red shows there (normal layer again).
    p.controller.layer.setClip(clip.id, false)
    const off = displayPixel(p, clip.id, 32, 32)
    expect(off[3], `off=${[...off]}`).toBeGreaterThan(150)
    expect(off[0]).toBeGreaterThan(150) // red
  })
})
