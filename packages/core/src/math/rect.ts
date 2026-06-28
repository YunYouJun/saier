import type { DirtyRect } from '../types/surface'

/** An empty rect (zero area). `union` treats it as the identity element. */
export function empty(): DirtyRect {
  return { x: 0, y: 0, width: 0, height: 0 }
}

export function isEmpty(rect: DirtyRect): boolean {
  return rect.width <= 0 || rect.height <= 0
}

/**
 * The smallest rect covering both `a` and `b`.
 * An empty operand is ignored, so `union(empty(), r)` === `r`.
 */
export function union(a: DirtyRect, b: DirtyRect): DirtyRect {
  if (isEmpty(a))
    return isEmpty(b) ? empty() : { ...b }
  if (isEmpty(b))
    return { ...a }

  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * The axis-aligned bounding box of a circle, as an integer-pixel rect.
 * Left/top floor and right/bottom ceil so the whole dab is covered.
 */
export function fromCircle(cx: number, cy: number, r: number): DirtyRect {
  if (r <= 0)
    return empty()
  const x = Math.floor(cx - r)
  const y = Math.floor(cy - r)
  const right = Math.ceil(cx + r)
  const bottom = Math.ceil(cy + r)
  return { x, y, width: right - x, height: bottom - y }
}

/** Grow a rect by `pad` on every side (negative `pad` shrinks it). */
export function expand(rect: DirtyRect, pad: number): DirtyRect {
  if (isEmpty(rect))
    return empty()
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

/**
 * Clip a rect to the `[0, w) × [0, h)` canvas bounds.
 * Returns an empty rect when there is no overlap.
 */
export function clampToSize(rect: DirtyRect, w: number, h: number): DirtyRect {
  const x = Math.max(0, rect.x)
  const y = Math.max(0, rect.y)
  const right = Math.min(w, rect.x + rect.width)
  const bottom = Math.min(h, rect.y + rect.height)
  if (right <= x || bottom <= y)
    return empty()
  return { x, y, width: right - x, height: bottom - y }
}
