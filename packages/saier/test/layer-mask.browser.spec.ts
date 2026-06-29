import type { RenderTextureBackend } from '@saier/pixi'
import type { Container, FederatedPointerEvent, Sprite } from 'pixi.js'
import type { Painter } from '../src'
import { Point, Rectangle } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush, PainterEraser } from '../src'

const painters: Painter[] = []
afterEach(() => {
  for (const p of painters.splice(0))
    p.destroy()
  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
  PainterEraser.size = 10
})

async function fixture(): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({ view: canvas, size: { width: 64, height: 64 }, boardSize: { width: 64, height: 64 }, pixiOptions: { backgroundAlpha: 0 } })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(p: Painter, docX: number, docY: number, t: number): FederatedPointerEvent {
  const b = p.board.container
  const global = new Point(b.position.x + (docX - 32) * b.scale.x, b.position.y + (docY - 32) * b.scale.y)
  return { global, pressure: 1, timeStamp: t, pointerId: 1, pointerType: 'pen' } as unknown as FederatedPointerEvent
}

interface Pointer {
  pointerDown: (e: FederatedPointerEvent) => void
  pointerMove: (e: FederatedPointerEvent) => void
  pointerUp: (e: FederatedPointerEvent) => void
}

/**
 * Serpentine raster over a doc-space rect with a fat brush. A single tap or a
 * sparse polyline under-covers because the input stabilizer lags behind fast,
 * widely-spaced points — so we lay down dense overlapping rows for a solid fill.
 */
function rasterStroke(pointer: Pointer, p: Painter, x0: number, x1: number, t0: number, y0 = 4, y1 = 60): void {
  let t = t0
  let row = 0
  for (let y = y0; y <= y1; y += 8, row++) {
    const xs: number[] = []
    for (let x = x0; x <= x1; x += 8)
      xs.push(x)
    if (row % 2 === 1)
      xs.reverse()
    pointer.pointerDown(eventAt(p, xs[0]!, y, t++))
    for (let i = 1; i < xs.length; i++)
      pointer.pointerMove(eventAt(p, xs[i]!, y, t++))
    pointer.pointerUp(eventAt(p, xs[xs.length - 1]!, y, t++))
  }
  p.flushSurfaceUploads()
}

/** One continuous serpentine stroke (a single undo entry) covering the rect. */
function rasterStrokeSingle(pointer: Pointer, p: Painter, x0: number, x1: number, t0: number, y0 = 4, y1 = 60): void {
  const pts: Array<[number, number]> = []
  let row = 0
  for (let y = y0; y <= y1; y += 8, row++) {
    const xs: number[] = []
    for (let x = x0; x <= x1; x += 8)
      xs.push(x)
    if (row % 2 === 1)
      xs.reverse()
    for (const x of xs)
      pts.push([x, y])
  }
  let t = t0
  pointer.pointerDown(eventAt(p, pts[0]![0], pts[0]![1], t++))
  for (let i = 1; i < pts.length; i++)
    pointer.pointerMove(eventAt(p, pts[i]![0], pts[i]![1], t++))
  pointer.pointerUp(eventAt(p, pts[pts.length - 1]![0], pts[pts.length - 1]![1], t++))
  p.flushSurfaceUploads()
}

/** Fill a doc-space rect with an opaque colour on the current paint target. */
function fillColor(p: Painter, color: number, x0 = 2, x1 = 62, y0 = 4, y1 = 60): void {
  p.useTool('brush')
  p.brush.setColor(color)
  p.brush.setSize(28)
  p.brush.setOpacity(1)
  rasterStroke(p.brush, p, x0, x1, 0, y0, y1)
}

/** Erase a doc-space rect of the current paint target (the mask when set). */
function eraseRange(p: Painter, x0: number, x1: number, t0 = 1000, y0 = 4, y1 = 60): void {
  p.useTool('eraser')
  PainterEraser.size = 28
  rasterStroke(p.eraser, p, x0, x1, t0, y0, y1)
}

/** Paint a doc-space rect of the current paint target with a colour. */
function paintRange(p: Painter, color: number, x0: number, x1: number, t0 = 2000, y0 = 4, y1 = 60): void {
  p.useTool('brush')
  p.brush.setColor(color)
  p.brush.setSize(28)
  p.brush.setOpacity(1)
  rasterStroke(p.brush, p, x0, x1, t0, y0, y1)
}

/** Read a layer's display (derived texture for clip/mask layers) — what export sees. */
function displayPixel(p: Painter, layerId: string, x: number, y: number): Uint8Array {
  const handle = p.surface.getDisplayHandle(layerId) as Container | Sprite
  const { pixels } = p.app.renderer.extract.pixels({ target: handle, frame: new Rectangle(x, y, 1, 1) })
  return new Uint8Array(pixels)
}

/** Read a pixel from the live on-screen composite (the rendered app stage). */
function screenPixel(p: Painter, x: number, y: number): Uint8Array {
  // board pos=(32,32), scale=1, document centred at the stage origin → doc (x,y)
  // maps to stage (x,y).
  const { pixels, width } = p.app.renderer.extract.pixels({ target: p.app.stage })
  const o = (y * width + x) * 4
  return new Uint8Array([pixels[o]!, pixels[o + 1]!, pixels[o + 2]!, pixels[o + 3]!])
}

describe('layer mask (P6-04, luminance)', () => {
  it('hides content where mask alpha is erased, shows it where opaque; non-destructive', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    expect(displayPixel(p, id, 12, 32)[3], 'content left before mask').toBeGreaterThan(200)
    expect(displayPixel(p, id, 52, 32)[3], 'content right before mask').toBeGreaterThan(200)

    // A fresh mask is opaque white → luminance 1 → reveals everything.
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()
    expect(displayPixel(p, id, 12, 32)[3], 'after addMask left').toBeGreaterThan(200)
    expect(displayPixel(p, id, 52, 32)[3], 'after addMask right').toBeGreaterThan(200)

    // Erase the mask's LEFT half → alpha→0 ⇒ premult rgb→0 ⇒ luminance 0 (hidden).
    p.setPaintTarget('mask')
    eraseRange(p, 2, 26)
    p.setPaintTarget('content')

    const left = displayPixel(p, id, 12, 32)
    const right = displayPixel(p, id, 52, 32)
    const dbg = `left=[${[...left]}] right=[${[...right]}]`
    expect(right[3], dbg).toBeGreaterThan(200) // mask white → content shows
    expect(right[0], dbg).toBeGreaterThan(150) // red preserved (content × 1)
    expect(left[3], dbg).toBeLessThan(60) // mask erased → content hidden

    // Non-destructive: disabling the mask reveals the full band again.
    p.controller.layer.setMaskEnabled(id, false)
    p.surface.flushUploads?.()
    expect(displayPixel(p, id, 12, 32)[3], 'mask-off left restored').toBeGreaterThan(200)
    expect(displayPixel(p, id, 52, 32)[3], 'mask-off right restored').toBeGreaterThan(200)

    // Re-enabling reflects the mask immediately, no repaint needed.
    p.controller.layer.setMaskEnabled(id, true)
    p.surface.flushUploads?.()
    expect(displayPixel(p, id, 12, 32)[3], 'mask-on left hidden').toBeLessThan(60)
    expect(displayPixel(p, id, 52, 32)[3], 'mask-on right shown').toBeGreaterThan(200)
  })

  it('paint BLACK on the mask hides content (luminance, not alpha)', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()

    // Paint the mask's left half opaque BLACK. Black is fully opaque (alpha 1),
    // so under the old alpha model it would REVEAL; under luminance it HIDES.
    p.setPaintTarget('mask')
    paintRange(p, 0x000000, 2, 26)
    p.setPaintTarget('content')

    const left = displayPixel(p, id, 12, 32)
    const right = displayPixel(p, id, 52, 32)
    const dbg = `left=[${[...left]}] right=[${[...right]}]`
    expect(left[3], dbg).toBeLessThan(60) // black mask → hidden
    expect(right[3], dbg).toBeGreaterThan(200) // untouched white mask → shown
  })

  it('paint 50% GRAY on the mask half-reveals content', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()

    // Mid-gray mask → luminance ≈ 0.5 → content alpha ≈ 128 (half-transparent).
    p.setPaintTarget('mask')
    paintRange(p, 0x808080, 2, 26)
    p.setPaintTarget('content')

    const left = displayPixel(p, id, 12, 32)
    const right = displayPixel(p, id, 52, 32)
    const dbg = `left=[${[...left]}] right=[${[...right]}]`
    expect(left[3], dbg).toBeGreaterThan(90) // partially visible…
    expect(left[3], dbg).toBeLessThan(170) // …but clearly not full
    expect(right[3], dbg).toBeGreaterThan(200) // white mask region still full
  })

  it('mask orientation: erasing the BOTTOM half hides the bottom, not the top', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()

    // Erase the mask's BOTTOM half (doc y ≥ 30). This catches any vertical flip
    // in the derived texture (the custom quad shader owns its own orientation).
    p.setPaintTarget('mask')
    eraseRange(p, 2, 62, 1000, 32, 60)
    p.setPaintTarget('content')

    const top = displayPixel(p, id, 32, 12)
    const bottom = displayPixel(p, id, 32, 52)
    const dbg = `top=[${[...top]}] bottom=[${[...bottom]}]`
    expect(top[3], dbg).toBeGreaterThan(200) // top mask untouched → shown
    expect(bottom[3], dbg).toBeLessThan(60) // bottom mask erased → hidden
  })

  it('routes strokes to the chosen target: paint white reveals, content stays separate', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0x00FF00)
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()

    // Hide the left half via the mask.
    p.setPaintTarget('mask')
    eraseRange(p, 2, 26)
    expect(displayPixel(p, id, 12, 32)[3], 'hidden after mask erase').toBeLessThan(60)

    // Painting WHITE back onto the mask restores luminance 1 → content reveals.
    paintRange(p, 0xFFFFFF, 2, 26)
    p.setPaintTarget('content')
    expect(displayPixel(p, id, 12, 32)[3], 'revealed after white mask repaint').toBeGreaterThan(200)

    // Switching back to the content target paints the content layer, not the
    // mask: a content stroke changes colour where the mask reveals.
    paintRange(p, 0x0000FF, 30, 62, 3000)
    const right = displayPixel(p, id, 52, 32)
    expect(right[2], `right=[${[...right]}]`).toBeGreaterThan(150) // blue now on content
  })

  it('mask strokes undo / redo independently of content', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.surface.flushUploads?.()

    // One continuous stroke = one undo entry.
    p.useTool('eraser')
    PainterEraser.size = 28
    p.setPaintTarget('mask')
    rasterStrokeSingle(p.eraser, p, 2, 26, 1000)
    p.setPaintTarget('content')
    expect(displayPixel(p, id, 12, 32)[3], 'hidden after erase').toBeLessThan(60)

    p.history.undo()
    p.surface.flushUploads?.()
    expect(displayPixel(p, id, 12, 32)[3], 'revealed after undo').toBeGreaterThan(200)

    p.history.redo()
    p.surface.flushUploads?.()
    expect(displayPixel(p, id, 12, 32)[3], 'hidden after redo').toBeLessThan(60)
  })

  it('export (handle extract) matches the on-screen composite', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.setPaintTarget('mask')
    eraseRange(p, 2, 26)
    p.setPaintTarget('content')

    // Hidden left, shown right — identically through the export path (per-layer
    // handle extract) and the live stage render.
    expect(displayPixel(p, id, 52, 32)[3], 'export right shown').toBeGreaterThan(200)
    expect(displayPixel(p, id, 12, 32)[3], 'export left hidden').toBeLessThan(60)
    expect(screenPixel(p, 52, 32)[3], 'screen right shown').toBeGreaterThan(150)
    expect(screenPixel(p, 12, 32)[3], 'screen left hidden').toBeLessThan(80)
  })

  it('detaching the mask restores content and frees the mask surface', async () => {
    const p = await fixture()
    const id = p.document.activeLayerId!
    const maskId = `${id}:mask`

    fillColor(p, 0xFF0000)
    p.controller.layer.addMask(id)
    p.setPaintTarget('mask')
    eraseRange(p, 2, 26)
    p.setPaintTarget('content')
    expect(displayPixel(p, id, 12, 32)[3], 'hidden while masked').toBeLessThan(60)

    const surface = p.surface as RenderTextureBackend
    expect(surface.hasLayer(maskId), 'mask surface exists while attached').toBe(true)

    p.controller.layer.removeMask(id)
    p.surface.flushUploads?.()

    // Content is fully shown again (mask never altered the content pixels)…
    expect(displayPixel(p, id, 12, 32)[3], 'restored after detach left').toBeGreaterThan(200)
    expect(displayPixel(p, id, 52, 32)[3], 'restored after detach right').toBeGreaterThan(200)
    // …and the hidden mask surface is released (no dangling surface).
    expect(surface.hasLayer(maskId), 'mask surface freed after detach').toBe(false)
  })

  it('switching a layer between luminance-mask and alpha-clip reuses the derived RT cleanly', async () => {
    const p = await fixture()

    // Base layer (the document's initial active layer): fully opaque red across
    // the whole canvas — the clip alpha source.
    fillColor(p, 0xFF0000)

    // Top clip layer: opaque blue. As a clip it shows wherever the base is
    // opaque → full blue.
    const top = p.controller.layer.add({ id: 'top', label: 'Top' })
    fillColor(p, 0x0000FF)
    p.controller.layer.setClip(top.id, true)
    p.surface.flushUploads?.()
    expect(displayPixel(p, top.id, 12, 32)[3], 'clip shows (alpha mode)').toBeGreaterThan(200)

    // Attach a mask (mask takes priority over clip) → mode flips to luminance.
    // Erase the mask's left half → top's left hides; the SAME derived RT is
    // recomputed in luminance mode (must not carry alpha-mode residue).
    p.controller.layer.addMask(top.id)
    p.setPaintTarget('mask')
    eraseRange(p, 2, 26)
    p.setPaintTarget('content')
    expect(displayPixel(p, top.id, 12, 32)[3], 'luminance: left hidden').toBeLessThan(60)
    expect(displayPixel(p, top.id, 52, 32)[3], 'luminance: right shown').toBeGreaterThan(200)

    // Disable the mask → mode flips back to alpha-clip. The left reveals again
    // (clip gates by the base's alpha, which is opaque there).
    p.controller.layer.setMaskEnabled(top.id, false)
    p.surface.flushUploads?.()
    const left = displayPixel(p, top.id, 12, 32)
    expect(left[3], `back-to-clip left=[${[...left]}]`).toBeGreaterThan(200)
    expect(left[2], `back-to-clip left=[${[...left]}]`).toBeGreaterThan(150) // blue
  })
})
