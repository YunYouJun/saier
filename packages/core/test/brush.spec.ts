import type { BrushContext, BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import { SimpleBrushEngine } from '../src'

const RED = { r: 1, g: 0, b: 0, a: 1 }

function ctx(baseSize: number): BrushContext {
  return { color: RED, baseSize }
}

function pt(x: number, y: number, pressure = 1, time = 0): BrushInputPoint {
  return { x, y, pressure, time }
}

/** Run a whole stroke and collect every dab (addPoints + endStroke). */
function stroke(engine: SimpleBrushEngine, c: BrushContext, points: BrushInputPoint[]) {
  engine.beginStroke(c)
  const dabs = points.flatMap(p => engine.addPoint(p))
  dabs.push(...engine.endStroke())
  return dabs
}

describe('simpleBrushEngine', () => {
  it('throws if addPoint is called before beginStroke', () => {
    const engine = new SimpleBrushEngine()
    expect(() => engine.addPoint(pt(0, 0))).toThrow()
  })

  it('produces ~length/spacing dabs along a straight line, covering both ends', () => {
    // baseSize 20 → maxRadius 10, full pressure → radius 10.
    // spacingRatio 0.25 → spacing = max(1, 0.25 * 10) = 2.5
    const engine = new SimpleBrushEngine({ spacingRatio: 0.25 })
    const c = ctx(20)
    const length = 100
    const dabs = stroke(engine, c, [pt(0, 0, 1), pt(length, 0, 1)])

    const spacing = 2.5
    const expected = length / spacing // 40
    // start stamp + ~40 stepped + end stamp; allow a small tolerance.
    expect(dabs.length).toBeGreaterThanOrEqual(expected - 2)
    expect(dabs.length).toBeLessThanOrEqual(expected + 3)

    // endpoints covered
    expect(dabs[0]).toMatchObject({ x: 0, y: 0 })
    expect(dabs.at(-1)).toMatchObject({ x: length, y: 0 })

    // even spacing along the line (consecutive stepped dabs ~spacing apart)
    const gap = dabs[2].x - dabs[1].x
    expect(gap).toBeCloseTo(spacing, 5)
  })

  it('carries residual distance across addPoint calls', () => {
    const engine = new SimpleBrushEngine({ spacingRatio: 0.25 })
    const c = ctx(20) // spacing 2.5
    engine.beginStroke(c)
    // Feed the line one unit at a time; spacing must not reset each call.
    const dabs = []
    for (let x = 0; x <= 100; x += 1)
      dabs.push(...engine.addPoint(pt(x, 0, 1)))
    dabs.push(...engine.endStroke())

    const spacing = 2.5
    const expected = 100 / spacing
    expect(dabs.length).toBeGreaterThanOrEqual(expected - 2)
    expect(dabs.length).toBeLessThanOrEqual(expected + 3)
  })

  it('scales radius monotonically with pressure within [minRadius, maxRadius]', () => {
    const engine = new SimpleBrushEngine({ minSizeRatio: 0.2, maxSizeRatio: 1 })
    const c = ctx(20) // maxRadius 10 → radius spans [2, 10]
    const radii: number[] = []
    for (let i = 0; i <= 10; i++) {
      engine.beginStroke(c)
      const [dab] = engine.addPoint(pt(0, 0, i / 10))
      radii.push(dab.radius)
      engine.endStroke()
    }
    expect(radii[0]).toBeCloseTo(2, 5)
    expect(radii.at(-1)).toBeCloseTo(10, 5)
    for (let i = 1; i < radii.length; i++)
      expect(radii[i]).toBeGreaterThan(radii[i - 1])
  })

  it('is deterministic: identical input yields deeply equal dab sequences', () => {
    const opts = { spacingRatio: 0.3, minSizeRatio: 0.1 }
    const points = [pt(0, 0, 0.3), pt(40, 20, 0.8), pt(80, 0, 0.5), pt(120, 60, 1)]

    const a = stroke(new SimpleBrushEngine(opts), ctx(24), points)
    const b = stroke(new SimpleBrushEngine(opts), ctx(24), points)
    expect(a).toEqual(b)
  })

  it('drives opacity from pressure when configured', () => {
    const engine = new SimpleBrushEngine({ minOpacity: 0.1, maxOpacity: 1 })
    const c = ctx(20)
    engine.beginStroke(c)
    const [low] = engine.addPoint(pt(0, 0, 0))
    engine.endStroke()
    engine.beginStroke(c)
    const [high] = engine.addPoint(pt(0, 0, 1))
    engine.endStroke()
    expect(low.opacity).toBeCloseTo(0.1, 5)
    expect(high.opacity).toBeCloseTo(1, 5)
  })
})
