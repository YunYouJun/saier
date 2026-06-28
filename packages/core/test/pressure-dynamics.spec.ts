import type { BrushContext, BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import { SimpleBrushEngine } from '../src'

const RED = { r: 1, g: 0, b: 0, a: 1 }

function ctx(baseSize = 20): BrushContext {
  return { color: RED, baseSize }
}

function pt(
  x: number,
  y: number,
  pressure: number,
  time: number,
  hasPressure = true,
): BrushInputPoint {
  return { x, y, pressure, time, hasPressure }
}

function stroke(engine: SimpleBrushEngine, points: BrushInputPoint[]) {
  engine.beginStroke(ctx())
  const dabs = points.flatMap(point => engine.addPoint(point))
  dabs.push(...engine.endStroke())
  return dabs
}

describe('pressure dynamics', () => {
  it('maps the same pressure through different size curves', () => {
    const linear = stroke(new SimpleBrushEngine({ sizeCurve: 'linear' }), [
      pt(0, 0, 0.5, 0),
    ])[0]
    const easeIn = stroke(new SimpleBrushEngine({ sizeCurve: 'ease-in' }), [
      pt(0, 0, 0.5, 0),
    ])[0]

    expect(easeIn.radius).toBeLessThan(linear.radius)
  })

  it('uses velocity fallback for mouse/no-pressure input', () => {
    const options = {
      pressureFallback: 'velocity' as const,
      velocityPressureMin: 0,
      velocityPressureMax: 1,
      spacingRatio: 0.25,
    }
    const slow = stroke(new SimpleBrushEngine(options), [
      pt(0, 0, 0, 0, false),
      pt(30, 0, 0, 300, false),
    ])
    const fast = stroke(new SimpleBrushEngine(options), [
      pt(0, 0, 0, 0, false),
      pt(30, 0, 0, 1, false),
    ])

    expect(Math.min(...fast.slice(1).map(dab => dab.radius)))
      .toBeLessThan(Math.min(...slow.slice(1).map(dab => dab.radius)))
  })

  it('tapers stroke endpoints while keeping the middle full size', () => {
    const dabs = stroke(new SimpleBrushEngine({
      taperIn: 20,
      taperOut: 20,
      taperMinFactor: 0.2,
    }), [
      pt(0, 0, 1, 0),
      pt(80, 0, 1, 80),
    ])
    const radii = dabs.map(dab => dab.radius)

    expect(radii[0]).toBeLessThan(Math.max(...radii))
    expect(radii.at(-1)).toBeLessThan(Math.max(...radii))
  })

  it('is deterministic for identical dynamic parameters', () => {
    const points = [
      pt(0, 0, 0.2, 0),
      pt(20, 5, 0.6, 10),
      pt(40, 0, 0.9, 20),
    ]
    const options = { sizeCurve: 'ease-in-out' as const, taperIn: 12, taperOut: 12 }

    expect(stroke(new SimpleBrushEngine(options), points))
      .toEqual(stroke(new SimpleBrushEngine(options), points))
  })
})
