import { describe, expect, it } from 'vitest'
import { compositeLockAlphaRegion } from '../src'

// All buffers are premultiplied RGBA bytes.
function px(r: number, g: number, b: number, a: number): Uint8Array {
  return new Uint8Array([r, g, b, a])
}

describe('compositeLockAlphaRegion', () => {
  it('preserves destination alpha', () => {
    const dst = px(255, 0, 0, 255) // opaque red
    const stroke = px(0, 0, 255, 255) // opaque blue
    const out = compositeLockAlphaRegion(dst, stroke)
    expect(out[3]).toBe(255)
  })

  it('fully recolours an opaque pixel when the stroke fully covers it', () => {
    const out = compositeLockAlphaRegion(px(255, 0, 0, 255), px(0, 0, 255, 255))
    expect(out[0]).toBe(0)
    expect(out[2]).toBe(255)
  })

  it('never adds paint to transparent pixels', () => {
    const out = compositeLockAlphaRegion(px(0, 0, 0, 0), px(0, 0, 255, 255))
    expect([...out]).toEqual([0, 0, 0, 0])
  })

  it('half-coverage blends halfway, alpha kept', () => {
    // stroke premultiplied blue at 50% coverage: rgb = 0.5*255 ≈ 128 in B, a=128
    const out = compositeLockAlphaRegion(px(255, 0, 0, 255), px(0, 0, 128, 128))
    expect(out[3]).toBe(255)
    expect(out[0]).toBeGreaterThan(120) // ~half red remains
    expect(out[0]).toBeLessThan(135)
    expect(out[2]).toBeGreaterThan(120) // ~half blue added
    expect(out[2]).toBeLessThan(135)
  })

  it('is deterministic', () => {
    const a = compositeLockAlphaRegion(px(200, 100, 50, 255), px(10, 20, 30, 90))
    const b = compositeLockAlphaRegion(px(200, 100, 50, 255), px(10, 20, 30, 90))
    expect([...a]).toEqual([...b])
  })
})
