import type { BrushDab, TilePatch } from '../src'
import { describe, expect, it } from 'vitest'
import { TiledSurface, TilePatchRecorder } from '../src'

function dab(overrides: Partial<BrushDab> = {}): BrushDab {
  return {
    x: 8,
    y: 8,
    radius: 3,
    opacity: 1,
    color: { r: 1, g: 0, b: 0, a: 1 },
    ...overrides,
  }
}

function tilePatches(value: unknown): TilePatch[] {
  if (!Array.isArray(value))
    throw new Error('expected TilePatch[]')
  return value
}

describe('tile undo recorder', () => {
  it('round-trips a multi-tile stroke through undo and redo', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const recorder = new TilePatchRecorder({ layerId: 'ink', surface })

    const before = surface.readRegion({ x: 0, y: 0, width: 16, height: 16 })
    recorder.beginStroke()
    recorder.paintDab(dab({ x: 8, y: 8, radius: 3 }), 'normal')
    const patch = recorder.endStroke()
    const after = surface.readRegion({ x: 0, y: 0, width: 16, height: 16 })

    expect(after).not.toEqual(before)
    expect(tilePatches(patch.before)).toHaveLength(4)

    recorder.applyPatch(patch, 'undo')
    expect(surface.readRegion({ x: 0, y: 0, width: 16, height: 16 })).toEqual(before)

    recorder.applyPatch(patch, 'redo')
    expect(surface.readRegion({ x: 0, y: 0, width: 16, height: 16 })).toEqual(after)
  })

  it('captures each dirty tile once even when multiple dabs hit it', () => {
    const surface = new TiledSurface({ width: 32, height: 32, tileSize: 8 })
    const recorder = new TilePatchRecorder({ layerId: 'ink', surface })

    recorder.beginStroke()
    recorder.paintDab(dab({ x: 2, y: 2, radius: 2 }), 'normal')
    recorder.paintDab(dab({ x: 3, y: 3, radius: 2 }), 'normal')
    const patch = recorder.endStroke()

    expect(tilePatches(patch.before).map(p => [p.tileX, p.tileY])).toEqual([[0, 0]])
  })

  it('does not include untouched allocated tiles in a patch', () => {
    const surface = new TiledSurface({ width: 32, height: 32, tileSize: 8 })
    const recorder = new TilePatchRecorder({ layerId: 'ink', surface })

    surface.writeRegion({ x: 20, y: 20, width: 1, height: 1 }, new Uint8ClampedArray([1, 0, 0, 1]))
    surface.flushDirty()

    recorder.beginStroke()
    recorder.paintDab(dab({ x: 2, y: 2, radius: 2 }), 'normal')
    const patch = recorder.endStroke()

    expect(tilePatches(patch.before).map(p => [p.tileX, p.tileY])).toEqual([[0, 0]])
  })
})
