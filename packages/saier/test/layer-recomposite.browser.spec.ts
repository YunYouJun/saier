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

/** A short semi-transparent stroke centred at document (32 + x, 32 + y). */
function strokeAt(painter: Painter, x: number, y: number, t: number): void {
  painter.useTool('brush')
  painter.brush.setColor(0x000000)
  painter.brush.setSize(8)
  painter.brush.setOpacity(0.3)
  painter.brush.pointerDown(eventAt(painter, x, y, t))
  painter.brush.pointerUp(eventAt(painter, x, y, t + 1))
  painter.flushSurfaceUploads()
}

function readPixel(painter: Painter, x: number, y: number): Uint8Array {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')
  const handle = painter.surface.getDisplayHandle(layerId) as Container | Sprite
  const { pixels } = painter.app.renderer.extract.pixels({ target: handle, frame: new Rectangle(x, y, 1, 1) })
  return new Uint8Array(pixels)
}

describe('same-layer re-composite (regression: existing strokes must not darken)', () => {
  it('keeps an earlier stroke unchanged when later, non-overlapping strokes are drawn', async () => {
    const painter = await fixture()

    strokeAt(painter, -16, -16, 0) // document ~(16,16)
    const first = readPixel(painter, 16, 16)
    expect(first[3]).toBeGreaterThan(0)

    // Two more strokes far away — must not touch the first stroke's pixels.
    // (Before the scratch-RT clear fix, the stale scratch was re-composited onto
    // the whole layer each stroke, darkening every existing semi-transparent pixel.)
    strokeAt(painter, 16, 16, 10) // ~(48,48)
    strokeAt(painter, 16, -16, 20) // ~(48,16)

    const afterMore = readPixel(painter, 16, 16)
    expect(afterMore[3]).toBe(first[3])
    expect(afterMore[0]).toBe(first[0])
    expect(afterMore[1]).toBe(first[1])
    expect(afterMore[2]).toBe(first[2])
  })
})
