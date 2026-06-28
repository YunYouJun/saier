import type { BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import { rasterizeDab, SimpleBrushEngine, Stabilizer, TiledSurface } from '../src'

const BLACK = { r: 0, g: 0, b: 0, a: 1 }

function pt(x: number, y: number, time: number, pressure = 1): BrushInputPoint {
  return { x, y, time, pressure, hasPressure: true }
}

function replay(points: BrushInputPoint[]): Uint8ClampedArray {
  const surface = new TiledSurface({ width: 128, height: 128, tileSize: 32 })
  const stabilizer = new Stabilizer({ strength: 2 })
  const engine = new SimpleBrushEngine({
    sizeCurve: 'ease-in-out',
    taperIn: 10,
    taperOut: 10,
  })

  engine.beginStroke({ color: BLACK, baseSize: 18 })
  for (const input of points) {
    for (const point of stabilizer.push(input)) {
      for (const dab of engine.addPoint(point))
        rasterizeDab(surface, dab, 'normal')
    }
  }
  for (const point of stabilizer.flush()) {
    for (const dab of engine.addPoint(point))
      rasterizeDab(surface, dab, 'normal')
  }
  for (const dab of engine.endStroke())
    rasterizeDab(surface, dab, 'normal')

  return surface.readRegion({ x: 0, y: 0, width: 128, height: 128 })
}

describe('p3 feel verification', () => {
  it('replays identical input into identical pixels', () => {
    const points = [
      pt(16, 16, 0, 0.2),
      pt(40, 24, 10, 0.5),
      pt(64, 16, 20, 0.8),
      pt(96, 60, 35, 0.4),
    ]

    expect(replay(points)).toEqual(replay(points))
  })

  it('keeps strong stabilizer lag bounded after flush', () => {
    const stabilizer = new Stabilizer({ strength: 3, ropeLength: 8 })
    const points = [pt(0, 0, 0), pt(5, 0, 1), pt(20, 0, 2), pt(40, 0, 3)]
    const out = points.flatMap(point => stabilizer.push(point))
    out.push(...stabilizer.flush())

    expect(out.at(-1)).toEqual(points.at(-1))
    expect(Math.max(...out.map((point, index) => Math.abs(point.x - points[Math.min(index, points.length - 1)].x))))
      .toBeLessThanOrEqual(16)
  })
})
