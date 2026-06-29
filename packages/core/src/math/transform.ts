/**
 * A layer's own affine placement in document space. Identity (the default) means
 * the layer's pixels map 1:1 onto document pixels — a plain painting layer.
 * Imported / transformed layers carry a non-identity transform; painting then
 * has to map document points back into layer-local pixels (see P6-05).
 */
export interface LayerTransform {
  /** translation in document px */
  x: number
  y: number
  scaleX: number
  scaleY: number
  /** rotation in radians, around the anchor */
  rotation: number
  /** pivot in layer-local px (rotation / scale happen around it) */
  anchorX: number
  anchorY: number
}

export interface Point2D {
  x: number
  y: number
}

/**
 * A 2×3 affine matrix in canvas/Pixi convention:
 * `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
 */
export interface AffineMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_LAYER_TRANSFORM: LayerTransform = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
})

export function createLayerTransform(partial: Partial<LayerTransform> = {}): LayerTransform {
  return { ...IDENTITY_LAYER_TRANSFORM, ...partial }
}

export function isIdentityTransform(t: LayerTransform | undefined): boolean {
  if (!t)
    return true
  return t.x === 0 && t.y === 0
    && t.scaleX === 1 && t.scaleY === 1
    && t.rotation === 0
    && t.anchorX === 0 && t.anchorY === 0
}

/**
 * Build the layer→document matrix:
 * `Translate(x,y) · Rotate(rotation) · Scale(scaleX,scaleY) · Translate(-anchor)`.
 */
export function composeLayerMatrix(t: LayerTransform): AffineMatrix {
  const cos = Math.cos(t.rotation)
  const sin = Math.sin(t.rotation)
  const a = cos * t.scaleX
  const b = sin * t.scaleX
  const c = -sin * t.scaleY
  const d = cos * t.scaleY
  const e = t.x - a * t.anchorX - c * t.anchorY
  const f = t.y - b * t.anchorX - d * t.anchorY
  return { a, b, c, d, e, f }
}

/** Invert a 2×3 affine matrix. Throws if it is singular (zero determinant). */
export function invertMatrix(m: AffineMatrix): AffineMatrix {
  const det = m.a * m.d - m.b * m.c
  if (det === 0)
    throw new Error('Cannot invert a singular affine matrix')
  const inv = 1 / det
  const a = m.d * inv
  const b = -m.b * inv
  const c = -m.c * inv
  const d = m.a * inv
  return {
    a,
    b,
    c,
    d,
    e: -(a * m.e + c * m.f),
    f: -(b * m.e + d * m.f),
  }
}

export function applyMatrix(m: AffineMatrix, p: Point2D): Point2D {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  }
}

/** Map a layer-local point into document space. */
export function layerToDocument(p: Point2D, t: LayerTransform): Point2D {
  return applyMatrix(composeLayerMatrix(t), p)
}

/** Map a document point into a layer's local pixel space (inverse transform). */
export function documentToLayer(p: Point2D, t: LayerTransform): Point2D {
  return applyMatrix(invertMatrix(composeLayerMatrix(t)), p)
}
