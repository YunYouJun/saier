import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter } from '../src'
import { PixiTileTextureBackend } from '@saier/pixi'
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

type TestBackend = 'rendertexture' | 'tiled'

async function fixture(backend?: TestBackend): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend,
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: { backgroundAlpha: 0 },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(painter: Painter, docX: number, docY: number, timeStamp: number): FederatedPointerEvent {
  const board = painter.board.container
  const global = new Point(
    board.position.x + (docX - 32) * board.scale.x,
    board.position.y + (docY - 32) * board.scale.y,
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

function readLayerPixels(painter: Painter): Uint8Array {
  const { pixels } = painter.app.renderer.extract.pixels({
    target: layerTarget(painter),
    frame: new Rectangle(0, 0, 64, 64),
  })
  return new Uint8Array(pixels)
}

function stroke(
  painter: Painter,
  points: Array<[number, number]>,
  startTime: number,
): void {
  painter.brush.pointerDown(eventAt(painter, points[0]![0], points[0]![1], startTime))
  for (let i = 1; i < points.length; i++)
    painter.brush.pointerMove(eventAt(painter, points[i]![0], points[i]![1], startTime + i))
  painter.brush.pointerUp(eventAt(painter, points[points.length - 1]![0], points[points.length - 1]![1], startTime + points.length))
  painter.flushSurfaceUploads()
}

function paintStroke(
  painter: Painter,
  color: number,
  points: Array<[number, number]>,
  startTime: number,
  size = 16,
): void {
  painter.useTool('brush')
  painter.brush.setPreset('pen')
  painter.brush.setColor(color)
  painter.brush.setOpacity(1)
  painter.brush.setSize(size)
  painter.brush.setHardness(0)
  stroke(painter, points, startTime)
}

function smudgeStroke(
  painter: Painter,
  points: Array<[number, number]>,
  startTime: number,
  options: {
    color?: number
    colorAmount?: number
    density?: number
    dilution?: number
    persistence?: number
    paperTextureStrength?: number
    size?: number
    wetEdge?: number
  } = {},
): void {
  painter.useTool('brush')
  painter.brush.setPreset('smudge')
  painter.brush.setColor(options.color ?? 0x000000)
  painter.brush.setOpacity(1)
  painter.brush.setSize(options.size ?? 14)
  painter.brush.setColorAmount(options.colorAmount ?? 0)
  painter.brush.setDensity(options.density ?? 1)
  painter.brush.setDilution(options.dilution ?? 0)
  painter.brush.setPersistence(options.persistence ?? 0.82)
  painter.brush.setWetEdge(options.wetEdge ?? 0)
  if ((options.paperTextureStrength ?? 0) > 0)
    painter.brush.setPaperTextureId('cold-press')
  painter.brush.setPaperTextureStrength(options.paperTextureStrength ?? 0)
  stroke(painter, points, startTime)
}

function readSurfacePixel(painter: Painter, x: number, y: number): Uint8ClampedArray {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')
  if (!(painter.surface instanceof PixiTileTextureBackend))
    throw new Error('surface pixel tests require tiled backend')
  return painter.surface.getSurface(layerId).readRegion({ x, y, width: 1, height: 1 })
}

function paintDirectDab(
  painter: Painter,
  dab: Parameters<Painter['surface']['paintDab']>[1],
): void {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')

  painter.surface.beginStroke(layerId)
  painter.surface.paintDab(layerId, dab, 'normal')
  const patch = painter.surface.endStroke(layerId)
  painter.recordStrokePatch(patch)
  painter.flushSurfaceUploads()
}

describe('smudge brush (P7-04/P7-08)', () => {
  it('uses the tiled backend by default for readback mixing', async () => {
    const painter = await fixture()
    expect(painter.surface).toBeInstanceOf(PixiTileTextureBackend)
    expect(painter.surface.sampleRegion).toBeTypeOf('function')
  })

  it('drags existing color into transparent pixels', async () => {
    const painter = await fixture('tiled')

    paintStroke(painter, 0xFF0000, [[18, 32], [18, 32]], 0, 18)
    expect(readPixel(painter, 42, 32)[3]).toBe(0)

    smudgeStroke(painter, [[18, 32], [24, 32], [30, 32], [36, 32], [42, 32]], 10, {
      persistence: 0.9,
      size: 14,
    })

    const dragged = readPixel(painter, 38, 32)
    expect(dragged[0], `dragged=${[...dragged]}`).toBeGreaterThan(20)
    expect(dragged[3], `dragged=${[...dragged]}`).toBeGreaterThan(20)
  })

  it('creates a purple transition across a red/blue boundary', async () => {
    const painter = await fixture('tiled')

    paintStroke(painter, 0xFF0000, [[24, 20], [24, 44]], 0, 18)
    paintStroke(painter, 0x0000FF, [[40, 20], [40, 44]], 10, 18)
    smudgeStroke(painter, [[24, 32], [30, 32], [36, 32], [42, 32]], 20, {
      persistence: 0.7,
      size: 16,
    })

    const mixed = readPixel(painter, 34, 32)
    expect(mixed[0], `mixed=${[...mixed]}`).toBeGreaterThan(40)
    expect(mixed[2], `mixed=${[...mixed]}`).toBeGreaterThan(40)
    expect(mixed[3], `mixed=${[...mixed]}`).toBeGreaterThan(120)
  })

  it('extends drag length as persistence increases', async () => {
    const low = await fixture('tiled')
    const high = await fixture('tiled')

    for (const painter of [low, high])
      paintStroke(painter, 0xFF0000, [[16, 32], [16, 32]], 0, 18)

    const path: Array<[number, number]> = [[16, 32], [24, 32], [32, 32], [40, 32], [48, 32]]
    smudgeStroke(low, path, 10, { persistence: 0.1, size: 14 })
    smudgeStroke(high, path, 10, { persistence: 0.92, size: 14 })

    expect(readPixel(high, 38, 32)[0]).toBeGreaterThan(readPixel(low, 38, 32)[0]!)
  })

  it('moves toward brush color as colorAmount increases', async () => {
    const pureSmudge = await fixture('tiled')
    const selfColor = await fixture('tiled')

    for (const painter of [pureSmudge, selfColor])
      paintStroke(painter, 0xFF0000, [[24, 32], [24, 32]], 0, 18)

    const path: Array<[number, number]> = [[24, 32], [30, 32]]
    smudgeStroke(pureSmudge, path, 10, { color: 0x0000FF, colorAmount: 0, size: 14 })
    smudgeStroke(selfColor, path, 10, { color: 0x0000FF, colorAmount: 1, size: 14 })

    const smudged = readPixel(pureSmudge, 24, 32)
    const painted = readPixel(selfColor, 24, 32)
    expect(smudged[0], `smudged=${[...smudged]}`).toBeGreaterThan(smudged[2]!)
    expect(painted[2], `painted=${[...painted]}`).toBeGreaterThan(painted[0]!)
  })

  it('round-trips smudge strokes through undo/redo and replays deterministically', async () => {
    const first = await fixture('tiled')
    const second = await fixture('tiled')

    for (const painter of [first, second])
      paintStroke(painter, 0xFF0000, [[18, 32], [18, 32]], 0, 18)

    const before = readLayerPixels(first)
    const path: Array<[number, number]> = [[18, 32], [24, 32], [30, 32], [36, 32], [42, 32]]
    smudgeStroke(first, path, 10, { persistence: 0.86, size: 14 })
    smudgeStroke(second, path, 10, { persistence: 0.86, size: 14 })
    const after = readLayerPixels(first)

    expect(after).toEqual(readLayerPixels(second))

    first.history.undo()
    first.flushSurfaceUploads()
    expect(readLayerPixels(first)).toEqual(before)

    first.history.redo()
    first.flushSurfaceUploads()
    expect(readLayerPixels(first)).toEqual(after)
  })

  it('builds a darker watercolor wet edge when enabled', async () => {
    const painter = await fixture('tiled')

    paintDirectDab(painter, {
      color: { r: 1, g: 0, b: 0, a: 1 },
      density: 1,
      dilution: 0,
      hardness: 0.7,
      opacity: 1,
      radius: 8,
      tipId: 'round-soft',
      wetEdge: 1,
      x: 32,
      y: 32,
    })

    const center = readSurfacePixel(painter, 32, 32)
    const edge = readSurfacePixel(painter, 37, 32)
    expect(edge[3], `center=${[...center]} edge=${[...edge]}`).toBeGreaterThan(center[3]!)
    expect(edge[0], `center=${[...center]} edge=${[...edge]}`).toBeGreaterThan(center[0]!)
  })

  it('anchors watercolor paper grain to document pixels', async () => {
    const first = await fixture('tiled')
    const second = await fixture('tiled')

    for (const painter of [first, second]) {
      paintDirectDab(painter, {
        color: { r: 1, g: 0, b: 0, a: 1 },
        density: 1,
        dilution: 0,
        opacity: 1,
        paperTextureId: 'cold-press',
        paperTextureStrength: 1,
        radius: 9,
        wetEdge: 0,
        x: 32,
        y: 32,
      })
    }

    const a = readSurfacePixel(first, 32, 32)
    const b = readSurfacePixel(first, 33, 32)
    expect(readLayerPixels(first)).toEqual(readLayerPixels(second))
    expect(a[3], `a=${[...a]} b=${[...b]}`).not.toBe(b[3])
  })

  it('guards smudge on backends without sampleRegion', async () => {
    const painter = await fixture('rendertexture')

    painter.useTool('brush')
    painter.brush.setPreset('smudge')
    expect(() => painter.brush.pointerDown(eventAt(painter, 24, 32, 0)))
      .toThrow('Smudge brush requires a surface backend with sampleRegion')

    painter.brush.cancelStroke()
  })
})
