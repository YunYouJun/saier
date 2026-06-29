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

async function fixture(backend: 'rendertexture' | 'tiled'): Promise<Painter> {
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

function readPixel(p: Painter, x: number, y: number): Uint8Array {
  const layerId = p.document.activeLayerId!
  const handle = p.surface.getDisplayHandle(layerId) as Container | Sprite
  const { pixels } = p.app.renderer.extract.pixels({ target: handle, frame: new Rectangle(x, y, 1, 1) })
  return new Uint8Array(pixels)
}

describe.each(['rendertexture', 'tiled'] as const)('lock alpha (%s backend)', (backend) => {
  it('recolours existing pixels without extending into transparent areas', async () => {
    const p = await fixture(backend)
    const layerId = p.document.activeLayerId!

    // Base: a horizontal red band across the middle (opaque).
    stroke(p, 0xFF0000, [[16, 32], [32, 32], [48, 32]], 0)
    const baseCenter = readPixel(p, 32, 32)
    expect(baseCenter[3]).toBeGreaterThan(200) // opaque
    expect(baseCenter[0]).toBeGreaterThan(200) // red

    // Lock transparency, then a vertical blue stroke crossing the band and
    // extending well above/below it into transparent space.
    p.controller.layer.setLockAlpha(layerId, true)
    stroke(p, 0x0000FF, [[32, 8], [32, 32], [32, 56]], 10)

    // Inside the band: recoloured toward blue, alpha preserved (still opaque).
    const after = readPixel(p, 32, 32)
    expect(after[3]).toBe(baseCenter[3]) // alpha unchanged
    expect(after[2]).toBeGreaterThan(after[0]) // now more blue than red

    // Above the band (was transparent): the blue must NOT have extended there.
    expect(readPixel(p, 32, 12)[3]).toBe(0)
    expect(readPixel(p, 32, 52)[3]).toBe(0)
  })

  it('undo restores the pre-lock-stroke pixels', async () => {
    const p = await fixture(backend)
    const layerId = p.document.activeLayerId!

    stroke(p, 0xFF0000, [[16, 32], [32, 32], [48, 32]], 0)
    const base = readPixel(p, 32, 32)

    p.controller.layer.setLockAlpha(layerId, true)
    stroke(p, 0x0000FF, [[32, 8], [32, 32], [32, 56]], 10)
    expect(readPixel(p, 32, 32)[2]).toBeGreaterThan(readPixel(p, 32, 32)[0]!)

    p.history.undo()
    p.flushSurfaceUploads()
    const restored = readPixel(p, 32, 32)
    expect(restored[0]).toBe(base[0]) // red restored
    expect(restored[2]).toBe(base[2])
    expect(restored[3]).toBe(base[3])
  })
})
