import type { LayerTransform, Point2D } from '../src'
import { describe, expect, it } from 'vitest'
import {
  composeLayerMatrix,
  createLayerTransform,
  documentToLayer,
  IDENTITY_LAYER_TRANSFORM,
  invertMatrix,
  isIdentityTransform,
  layerToDocument,
} from '../src'

function close(a: Point2D, b: Point2D, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps
}

const POINTS: Point2D[] = [
  { x: 0, y: 0 },
  { x: 32, y: 32 },
  { x: 9, y: -11 },
  { x: 128.5, y: 64.25 },
]

describe('layer transform math', () => {
  it('identity maps points to themselves', () => {
    for (const p of POINTS) {
      expect(close(layerToDocument(p, IDENTITY_LAYER_TRANSFORM), p)).toBe(true)
      expect(close(documentToLayer(p, IDENTITY_LAYER_TRANSFORM), p)).toBe(true)
    }
    expect(isIdentityTransform(IDENTITY_LAYER_TRANSFORM)).toBe(true)
    expect(isIdentityTransform(undefined)).toBe(true)
    expect(isIdentityTransform(createLayerTransform({ scaleX: 2 }))).toBe(false)
  })

  it('pure translation moves the origin', () => {
    const t = createLayerTransform({ x: 5, y: 7 })
    expect(close(layerToDocument({ x: 0, y: 0 }, t), { x: 5, y: 7 })).toBe(true)
  })

  it('documentToLayer and layerToDocument are inverses (translate + scale + rotate + anchor)', () => {
    const transforms: LayerTransform[] = [
      createLayerTransform({ x: 19, y: 43, scaleX: 1.75, scaleY: 1.75, rotation: 0.6 }),
      createLayerTransform({ x: -8, y: 12, scaleX: 2, scaleY: 0.5, rotation: -1.2, anchorX: 10, anchorY: 20 }),
      createLayerTransform({ x: 100, y: -50, scaleX: 0.8, scaleY: 1.3, rotation: 3.0, anchorX: 32, anchorY: 32 }),
    ]
    for (const t of transforms) {
      for (const p of POINTS) {
        expect(close(documentToLayer(layerToDocument(p, t), t), p)).toBe(true)
        expect(close(layerToDocument(documentToLayer(p, t), t), p)).toBe(true)
      }
    }
  })

  it('inverting a singular matrix throws', () => {
    const singular = composeLayerMatrix(createLayerTransform({ scaleX: 0 }))
    expect(() => invertMatrix(singular)).toThrow(/singular/)
  })

  it('is deterministic (no Date.now / Math.random)', () => {
    const t = createLayerTransform({ x: 3, y: 4, scaleX: 1.1, rotation: 0.25 })
    const a = documentToLayer({ x: 50, y: 60 }, t)
    const b = documentToLayer({ x: 50, y: 60 }, t)
    expect(a).toEqual(b)
  })
})
