import { describe, expect, it } from 'vitest'
import {
  clampToSize,
  empty,
  expand,
  fromCircle,
  hexToRGBA,
  isEmpty,
  premultiply,
  rgbaToHex,
  union,
  unpremultiply,
} from '../src'

describe('dirty rect', () => {
  it('treats empty as the union identity', () => {
    const r = { x: 5, y: 5, width: 10, height: 10 }
    expect(union(empty(), r)).toEqual(r)
    expect(union(r, empty())).toEqual(r)
    expect(isEmpty(union(empty(), empty()))).toBe(true)
  })

  it('unions two overlapping rects into their bounding box', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    const b = { x: 5, y: 5, width: 10, height: 10 }
    expect(union(a, b)).toEqual({ x: 0, y: 0, width: 15, height: 15 })
  })

  it('unions disjoint rects', () => {
    const a = { x: 0, y: 0, width: 2, height: 2 }
    const b = { x: 10, y: 10, width: 2, height: 2 }
    expect(union(a, b)).toEqual({ x: 0, y: 0, width: 12, height: 12 })
  })

  it('builds an integer bbox from a circle', () => {
    expect(fromCircle(10, 10, 3)).toEqual({ x: 7, y: 7, width: 6, height: 6 })
    // fractional center: floor left/top, ceil right/bottom
    expect(fromCircle(10.5, 10.5, 2)).toEqual({ x: 8, y: 8, width: 5, height: 5 })
    expect(isEmpty(fromCircle(10, 10, 0))).toBe(true)
  })

  it('expands and shrinks symmetrically', () => {
    const r = { x: 10, y: 10, width: 4, height: 4 }
    expect(expand(r, 2)).toEqual({ x: 8, y: 8, width: 8, height: 8 })
    expect(expand(r, -1)).toEqual({ x: 11, y: 11, width: 2, height: 2 })
  })

  it('clamps to canvas bounds', () => {
    expect(clampToSize({ x: -5, y: -5, width: 20, height: 20 }, 10, 10))
      .toEqual({ x: 0, y: 0, width: 10, height: 10 })
    expect(clampToSize({ x: 5, y: 5, width: 10, height: 10 }, 10, 10))
      .toEqual({ x: 5, y: 5, width: 5, height: 5 })
    // fully outside → empty
    expect(isEmpty(clampToSize({ x: 100, y: 100, width: 4, height: 4 }, 10, 10))).toBe(true)
  })
})

describe('color', () => {
  it('parses #rrggbb', () => {
    expect(hexToRGBA('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })

  it('parses shorthand and alpha forms', () => {
    expect(hexToRGBA('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(hexToRGBA('00000080').a).toBeCloseTo(128 / 255, 5)
  })

  it('round-trips through hex', () => {
    expect(rgbaToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
  })

  it('throws on malformed input', () => {
    expect(() => hexToRGBA('#xyz')).toThrow()
    expect(() => hexToRGBA('#12345')).toThrow()
  })

  it('premultiplies and inverts', () => {
    const c = { r: 1, g: 0.5, b: 0, a: 0.5 }
    const p = premultiply(c)
    expect(p).toEqual({ r: 0.5, g: 0.25, b: 0, a: 0.5 })
    const back = unpremultiply(p)
    expect(back.r).toBeCloseTo(1, 5)
    expect(back.g).toBeCloseTo(0.5, 5)
    expect(unpremultiply({ r: 0, g: 0, b: 0, a: 0 })).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })
})
