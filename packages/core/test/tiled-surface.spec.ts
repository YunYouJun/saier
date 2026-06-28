import type { DirtyRect } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { TiledSurface } from '../src'

function rgbaBytes(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values)
}

function regionBytes(rect: DirtyRect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let i = 0; i < out.length; i++)
    out[i] = i % 256
  return out
}

describe('tiledSurface', () => {
  it('maps document rects to covered tiles in row-major order', () => {
    const surface = new TiledSurface({ width: 10, height: 10, tileSize: 4 })

    expect(surface.tilesForRect({ x: 3, y: 3, width: 3, height: 3 })).toEqual([
      { tileX: 0, tileY: 0 },
      { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 },
      { tileX: 1, tileY: 1 },
    ])
    expect(surface.tilesForRect({ x: 0, y: 0, width: 4, height: 4 })).toEqual([
      { tileX: 0, tileY: 0 },
    ])
    expect(surface.tilesForRect({ x: 9, y: 9, width: 20, height: 20 })).toEqual([
      { tileX: 2, tileY: 2 },
    ])
  })

  it('round-trips region data across tile boundaries', () => {
    const surface = new TiledSurface({ width: 8, height: 4, tileSize: 4 })
    const rect = { x: 3, y: 1, width: 3, height: 2 }
    const data = regionBytes(rect)

    surface.writeRegion(rect, data)

    expect(surface.allocatedTileCount).toBe(2)
    expect(surface.readRegion(rect)).toEqual(data)
    expect(surface.readRegion({ x: 0, y: 0, width: 1, height: 1 })).toEqual(
      new Uint8ClampedArray(4),
    )
  })

  it('allocates only the touched tile on first write', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 4 })

    surface.writeRegion({ x: 7, y: 7, width: 1, height: 1 }, rgbaBytes([1, 2, 3, 4]))

    expect(surface.allocatedTileCount).toBe(1)
    expect(surface.hasTile(1, 1)).toBe(true)
    expect(surface.hasTile(0, 0)).toBe(false)
    expect(surface.readRegion({ x: 7, y: 7, width: 1, height: 1 })).toEqual(
      rgbaBytes([1, 2, 3, 4]),
    )
  })

  it('tracks dirty tiles and clears them on flush', () => {
    const surface = new TiledSurface({ width: 12, height: 12, tileSize: 4 })

    surface.markDirty({ x: 1, y: 1, width: 2, height: 2 })
    surface.markDirty({ x: 5, y: 5, width: 5, height: 1 })
    const dirty = surface.flushDirty()

    expect(dirty.rect).toEqual({ x: 1, y: 1, width: 9, height: 5 })
    expect(dirty.tiles).toEqual([
      { tileX: 0, tileY: 0 },
      { tileX: 1, tileY: 1 },
      { tileX: 2, tileY: 1 },
    ])
    expect(surface.dirtyTileCount).toBe(0)
    expect(surface.flushDirty()).toEqual({
      rect: { x: 0, y: 0, width: 0, height: 0 },
      tiles: [],
    })
  })

  it('does not allocate tiles while iterating untouched regions', () => {
    const surface = new TiledSurface({ width: 8, height: 8, tileSize: 4 })
    const visitor = vi.fn()

    surface.forEachTileInRect({ x: 0, y: 0, width: 8, height: 8 }, visitor)

    expect(visitor).toHaveBeenCalledTimes(4)
    expect(visitor.mock.calls.map(([, coord]) => coord)).toEqual([
      { tileX: 0, tileY: 0 },
      { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 },
      { tileX: 1, tileY: 1 },
    ])
    expect(visitor.mock.calls.every(([tile]) => tile === undefined)).toBe(true)
    expect(surface.allocatedTileCount).toBe(0)
  })

  it('reports memory only for allocated tiles', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 4 })

    surface.forEachTileInRect({ x: 0, y: 0, width: 16, height: 16 }, () => {})
    expect(surface.getMemorySnapshot().totalEstimatedBytes).toBe(0)

    surface.writeRegion({ x: 3, y: 1, width: 3, height: 1 }, regionBytes({ x: 3, y: 1, width: 3, height: 1 }))

    const snapshot = surface.getMemorySnapshot('layer-a')
    expect(snapshot.totalEstimatedBytes).toBe(2 * 4 * 4 * 4)
    expect(snapshot.entries).toEqual([
      expect.objectContaining({
        id: 'layer-a:allocated-tiles',
        bytes: 128,
        count: 2,
        kind: 'cpu',
      }),
    ])
  })
})
