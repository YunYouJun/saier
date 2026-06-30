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

  it('uses density as per-dab pigment deposit strength', () => {
    const one = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const two = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(one, dab({ density: 0.5 }), 'normal')
    rasterizeDab(two, dab({ density: 0.5 }), 'normal')
    rasterizeDab(two, dab({ density: 0.5 }), 'normal')

    expect(pixel(one, 8, 8)).toEqual(new Uint8ClampedArray([128, 0, 0, 128]))
    expect(pixel(two, 8, 8)).toEqual(new Uint8ClampedArray([192, 0, 0, 192]))
  })

  it('uses dilution to thin pigment so the destination shows through', () => {
    const dry = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const wet = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const blue = dab({ color: { r: 0, g: 0, b: 1, a: 1 } })

    rasterizeDab(dry, blue, 'normal')
    rasterizeDab(wet, blue, 'normal')
    rasterizeDab(dry, dab({ dilution: 0 }), 'normal')
    rasterizeDab(wet, dab({ dilution: 0.5 }), 'normal')

    expect(pixel(dry, 8, 8)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    expect(pixel(wet, 8, 8)).toEqual(new Uint8ClampedArray([128, 0, 128, 255]))
  })

  it('softens edges as hardness increases', () => {
    const hard = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const soft = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(hard, dab({ hardness: 0 }), 'normal')
    rasterizeDab(soft, dab({ hardness: 0.8 }), 'normal')

    expect(pixel(hard, 11, 8)[3]).toBeGreaterThan(pixel(soft, 11, 8)[3]!)
  })

  it('builds pigment up at the edge when wet edge is enabled', () => {
    const dry = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const wet = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(dry, dab({ wetEdge: 0 }), 'normal')
    rasterizeDab(wet, dab({ wetEdge: 1 }), 'normal')

    expect(pixel(dry, 8, 8)[3]).toBeGreaterThan(pixel(dry, 11, 8)[3]!)
    expect(pixel(wet, 11, 8)[3]).toBeGreaterThan(pixel(wet, 8, 8)[3]!)
  })

  it('modulates coverage with document-anchored paper texture', () => {
    const plain = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const off = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const textured = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const repeated = new TiledSurface({ width: 16, height: 16, tileSize: 8 })

    rasterizeDab(plain, dab({ radius: 6 }), 'normal')
    rasterizeDab(off, dab({ radius: 6, paperTextureId: 'cold-press', paperTextureStrength: 0 }), 'normal')
    rasterizeDab(textured, dab({ radius: 6, paperTextureId: 'cold-press', paperTextureStrength: 1 }), 'normal')
    rasterizeDab(repeated, dab({ radius: 6, paperTextureId: 'cold-press', paperTextureStrength: 1 }), 'normal')

    expect(off.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
      .toEqual(plain.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
    expect(textured.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
      .toEqual(repeated.readRegion({ x: 0, y: 0, width: 16, height: 16 }))
    expect(pixel(textured, 8, 8)[3]).toBeLessThan(pixel(plain, 8, 8)[3]!)
    expect(pixel(textured, 8, 8)[3]).not.toBe(pixel(textured, 9, 8)[3])
  })
})
