import { describe, expect, it } from 'vitest'
import { averagePremultiplied, TiledSurface } from '../src'

describe('surface sampling', () => {
  it('samples a solid color from tiled surface as straight RGBA', () => {
    const surface = new TiledSurface({ width: 4, height: 4, tileSize: 2 })
    surface.writeRegion(
      { x: 1, y: 1, width: 2, height: 1 },
      new Uint8ClampedArray([
        255,
        0,
        0,
        255,
        255,
        0,
        0,
        255,
      ]),
    )

    expect(surface.sampleRegion({ x: 1, y: 1, width: 2, height: 1 }))
      .toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })

  it('averages red and blue regions without premultiplied color drift', () => {
    const color = averagePremultiplied(
      new Uint8ClampedArray([
        255,
        0,
        0,
        255,
        0,
        0,
        255,
        255,
      ]),
      2,
      1,
    )

    expect(color.r).toBeCloseTo(0.5, 5)
    expect(color.g).toBe(0)
    expect(color.b).toBeCloseTo(0.5, 5)
    expect(color.a).toBe(1)
  })

  it('unpremultiplies semitransparent pixels', () => {
    const color = averagePremultiplied(
      new Uint8ClampedArray([128, 0, 0, 128]),
      1,
      1,
    )

    expect(color.r).toBeCloseTo(1, 2)
    expect(color.g).toBe(0)
    expect(color.b).toBe(0)
    expect(color.a).toBeCloseTo(128 / 255, 5)
  })

  it('lets transparent pixels reduce alpha without polluting RGB', () => {
    const color = averagePremultiplied(
      new Uint8ClampedArray([
        255,
        0,
        0,
        255,
        0,
        0,
        0,
        0,
      ]),
      2,
      1,
    )

    expect(color.r).toBe(1)
    expect(color.g).toBe(0)
    expect(color.b).toBe(0)
    expect(color.a).toBeCloseTo(0.5, 5)
  })

  it('treats out-of-bounds sampling area as transparent', () => {
    const surface = new TiledSurface({ width: 2, height: 2, tileSize: 2 })
    surface.writeRegion(
      { x: 0, y: 0, width: 1, height: 1 },
      new Uint8ClampedArray([255, 0, 0, 255]),
    )

    const color = surface.sampleRegion({ x: -1, y: -1, width: 2, height: 2 })

    expect(color.r).toBe(1)
    expect(color.g).toBe(0)
    expect(color.b).toBe(0)
    expect(color.a).toBeCloseTo(0.25, 5)
  })

  it('weights sampling by dab footprint when requested', () => {
    const surface = new TiledSurface({ width: 4, height: 1, tileSize: 4 })
    surface.writeRegion(
      { x: 0, y: 0, width: 4, height: 1 },
      new Uint8ClampedArray([
        255,
        0,
        0,
        255,
        255,
        0,
        0,
        255,
        0,
        0,
        255,
        255,
        0,
        0,
        255,
        255,
      ]),
    )

    const unweighted = surface.sampleRegion({ x: 0, y: 0, width: 4, height: 1 })
    const weighted = surface.sampleRegion(
      { x: 0, y: 0, width: 4, height: 1 },
      {
        dab: {
          x: 1,
          y: 0.5,
          radius: 1.5,
          hardness: 0,
          tipId: 'round-hard',
        },
      },
    )

    expect(weighted.r).toBeGreaterThan(unweighted.r)
    expect(weighted.b).toBeLessThan(unweighted.b)
    expect(weighted.a).toBe(1)
  })
})
