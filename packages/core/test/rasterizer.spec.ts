import type { BrushDab } from '../src'
import { describe, expect, it } from 'vitest'
import { rasterizeDab, TiledSurface } from '../src'

const RED = { r: 1, g: 0, b: 0, a: 1 }

function dab(overrides: Partial<BrushDab> = {}): BrushDab {
  return {
    x: 8,
    y: 8,
    radius: 4,
    opacity: 1,
    color: RED,
    ...overrides,
  }
}

function pixel(surface: TiledSurface, x: number, y: number): Uint8ClampedArray {
  return surface.readRegion({ x, y, width: 1, height: 1 })
}

describe('rasterizeDab', () => {
  it('writes opaque center pixels and antialiased edge pixels', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(surface, dab(), 'normal')

    expect(pixel(surface, 8, 8)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    const edge = pixel(surface, 11, 10)
    expect(edge[0]).toBeGreaterThan(0)
    expect(edge[0]).toBeLessThan(255)
    expect(edge[3]).toBe(edge[0])
  })

  it('erases covered pixels with destination-out compositing', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(surface, dab({ radius: 5 }), 'normal')
    rasterizeDab(surface, dab({ radius: 2 }), 'erase')

    expect(pixel(surface, 8, 8)).toEqual(new Uint8ClampedArray([0, 0, 0, 0]))
    expect(pixel(surface, 4, 8)[3]).toBeGreaterThan(0)
  })

  it('is deterministic for identical input', () => {
    const first = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const second = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(first, dab({ x: 7.25, y: 8.75, radius: 4.5, opacity: 0.6 }), 'normal')
    rasterizeDab(second, dab({ x: 7.25, y: 8.75, radius: 4.5, opacity: 0.6 }), 'normal')

    expect(first.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
      .toEqual(second.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
  })

  it('writes seamlessly across tile boundaries', () => {
    const surface = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(surface, dab({ x: 8, y: 8, radius: 3 }), 'normal')

    expect(surface.allocatedTileCount).toBe(4)
    expect(pixel(surface, 7, 8)[3]).toBe(255)
    expect(pixel(surface, 8, 8)[3]).toBe(255)
    expect(surface.flushDirty().tiles).toEqual([
      { tileX: 0, tileY: 0 },
      { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 },
      { tileX: 1, tileY: 1 },
    ])
  })
})
