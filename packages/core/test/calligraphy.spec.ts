import type { BrushContext, BrushEngine, BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import { CalligraphyEngine, fromShodoStroke, toShodoStroke } from '../src'

const BLACK = { r: 0, g: 0, b: 0, a: 1 }

function ctx(): BrushContext {
  return { color: BLACK, baseSize: 24 }
}

function pt(x: number, y: number, time: number, hasPressure = false): BrushInputPoint {
  return { x, y, time, pressure: hasPressure ? 1 : 0, hasPressure }
}

function stroke(engine: BrushEngine, points: BrushInputPoint[]) {
  engine.beginStroke(ctx())
  const dabs = points.flatMap(point => engine.addPoint(point))
  dabs.push(...engine.endStroke())
  return dabs
}

describe('calligraphyEngine', () => {
  it('is interchangeable through the BrushEngine interface', () => {
    const engine: BrushEngine = new CalligraphyEngine({ bufferSize: 1 })
    const dabs = stroke(engine, [pt(0, 0, 0), pt(20, 0, 100)])

    expect(dabs.length).toBeGreaterThan(0)
    expect(dabs[0]).toMatchObject({ color: BLACK })
  })

  it('keeps shodo behavior: fast strokes are thinner than slow strokes', () => {
    const slow = stroke(new CalligraphyEngine({ bufferSize: 1, pressureVelocity: 1 }), [
      pt(0, 0, 0),
      pt(30, 0, 300),
    ])
    const fast = stroke(new CalligraphyEngine({ bufferSize: 1, pressureVelocity: 1 }), [
      pt(0, 0, 0),
      pt(30, 0, 1),
    ])

    expect(avgRadius(fast.slice(1))).toBeLessThan(avgRadius(slow.slice(1)))
  })

  it('adds a deterministic taper-out flick at stroke end', () => {
    const dabs = stroke(new CalligraphyEngine({ bufferSize: 1, taperOutSteps: 3 }), [
      pt(0, 0, 0),
      pt(30, 0, 100),
    ])
    const tail = dabs.slice(-3)

    expect(tail[0].x).toBeGreaterThan(30)
    expect(tail[2].radius).toBeLessThan(tail[0].radius)
  })

  it('is deterministic and supports the shodo stroke format', () => {
    const points = [pt(1, 2, 10, true), pt(5, 8, 20, true), pt(9, 2, 30, true)]
    const encoded = toShodoStroke(points)
    const decoded = fromShodoStroke(encoded, points[0].time)

    expect(decoded).toEqual(points)
    expect(stroke(new CalligraphyEngine(), decoded))
      .toEqual(stroke(new CalligraphyEngine(), decoded))
  })
})

function avgRadius(dabs: { radius: number }[]): number {
  return dabs.reduce((sum, dab) => sum + dab.radius, 0) / dabs.length
}
