import type { BrushDab, BrushInputPoint, RGBA } from '../src'
import { describe, expect, it } from 'vitest'
import { isSmudgeBrushEngine, SmudgeEngine } from '../src'

const RED: RGBA = { r: 1, g: 0, b: 0, a: 1 }
const BLUE: RGBA = { r: 0, g: 0, b: 1, a: 1 }
const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 }

function dab(overrides: Partial<BrushDab> = {}): BrushDab {
  return {
    x: 0,
    y: 0,
    radius: 4,
    opacity: 1,
    color: BLUE,
    ...overrides,
  }
}

function point(x: number, time: number): BrushInputPoint {
  return { x, y: 0, pressure: 1, hasPressure: true, time }
}

describe('smudgeEngine', () => {
  it('updates a deterministic smudge bucket from sampled color', () => {
    const engine = new SmudgeEngine({
      colorAmount: 0,
      persistence: 0.5,
      smudge: 1,
      density: 0.75,
      dilution: 0.25,
      wetEdge: 0.5,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.4,
    })
    engine.beginStroke({ color: BLUE, baseSize: 8 })

    const first = engine.prepareDab(dab(), RED)
    const second = engine.prepareDab(dab(), TRANSPARENT)

    expect(first.color).toEqual(RED)
    expect(first).toMatchObject({
      density: 0.75,
      dilution: 0.25,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.4,
      wetEdge: 0.5,
    })
    expect(second.color.r).toBeCloseTo(0.5, 5)
    expect(second.color.g).toBe(0)
    expect(second.color.b).toBe(0)
    expect(second.color.a).toBeCloseTo(0.5, 5)
  })

  it('mixes brush color according to colorAmount', () => {
    const engine = new SmudgeEngine({
      colorAmount: 0.5,
      persistence: 0,
      smudge: 1,
      density: 1,
      dilution: 0,
    })
    engine.beginStroke({ color: BLUE, baseSize: 8 })

    const mixed = engine.prepareDab(dab(), RED)

    expect(mixed.color.r).toBeCloseTo(0.5, 5)
    expect(mixed.color.g).toBe(0)
    expect(mixed.color.b).toBeCloseTo(0.5, 5)
    expect(mixed.color.a).toBe(1)
  })

  it('still produces spaced geometry through the BrushEngine contract', () => {
    const engine = new SmudgeEngine({ spacingRatio: 0.5 })
    engine.beginStroke({ color: BLUE, baseSize: 12 })

    const dabs = [
      ...engine.addPoint(point(0, 0)),
      ...engine.addPoint(point(24, 24)),
      ...engine.endStroke(),
    ]

    expect(isSmudgeBrushEngine(engine)).toBe(true)
    expect(dabs.length).toBeGreaterThan(2)
  })
})
