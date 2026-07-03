import type { BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import { Stabilizer } from '../src'

function pt(x: number, y: number, time: number): BrushInputPoint {
  return { x, y, pressure: 1, hasPressure: true, time }
}

function run(strength: number, points: BrushInputPoint[]): BrushInputPoint[] {
  const stabilizer = new Stabilizer({ strength, ropeLength: 5 })
  const out = points.flatMap(point => stabilizer.push(point))
  out.push(...stabilizer.flush())
  return out
}

function roughness(points: BrushInputPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    total += Math.abs(next.y - 2 * cur.y + prev.y)
  }
  return total
}

describe('stabilizer', () => {
  it('separates strength 0/light/medium/strong by measurable smoothing', () => {
    const points = Array.from({ length: 16 }, (_, i) => pt(i * 4, i % 2 === 0 ? 0 : 8, i))

    const raw = run(0, points)
    const light = run(1, points)
    const medium = run(2, points)
    const strong = run(3, points)

    expect(roughness(light)).toBeLessThan(roughness(raw))
    expect(roughness(medium)).toBeLessThan(roughness(light))
    expect(roughness(strong)).toBeLessThan(roughness(raw))
    expect(strong).not.toEqual(medium)
  })

  it('smooths a slow noisy circle deterministically', () => {
    const circle = Array.from({ length: 32 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 32
      const jitter = i % 2 === 0 ? 1.5 : -1.5
      return pt(Math.cos(a) * 20 + jitter, Math.sin(a) * 20 - jitter, i * 16)
    })

    const a = run(2, circle)
    const b = run(2, circle)

    expect(a).toEqual(b)
    expect(roughness(a)).toBeLessThan(roughness(circle))
  })

  it('flushes a strong rope back to the final input point', () => {
    const stabilizer = new Stabilizer({ strength: 3, ropeLength: 10 })
    stabilizer.push(pt(0, 0, 0))
    stabilizer.push(pt(5, 0, 1))
    const flushed = stabilizer.flush()

    expect(flushed).toEqual([pt(5, 0, 1)])
  })

  it('keeps a SAI-style lazy rope still until the pointer pulls beyond the correction radius', () => {
    const stabilizer = new Stabilizer({ strength: 8, ropeLength: 20 })

    const out = [
      ...stabilizer.push(pt(0, 0, 0)),
      ...stabilizer.push(pt(10, 0, 1000)),
      ...stabilizer.push(pt(20, 0, 2000)),
      ...stabilizer.push(pt(25, 0, 3000)),
    ]

    expect(out.map(point => point.x)).toEqual([0, 0, 0, 5])
    expect(stabilizer.flush()).toEqual([pt(25, 0, 3000)])
  })

  it('shortens the lazy rope for fast strokes so high correction still follows the hand', () => {
    const slow = new Stabilizer({ strength: 8, ropeLength: 20 })
    slow.push(pt(0, 0, 0))
    const [slowOut] = slow.push(pt(24, 0, 1000))

    const fast = new Stabilizer({ strength: 8, ropeLength: 20 })
    fast.push(pt(0, 0, 0))
    const [fastOut] = fast.push(pt(24, 0, 1))

    expect(slowOut!.x).toBeCloseTo(4)
    expect(fastOut!.x).toBeCloseTo(15)
    expect(fastOut!.x).toBeGreaterThan(slowOut!.x)
  })
})
