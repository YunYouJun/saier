import type { BrushDab, LayerTransform } from '@saier/core'
import { documentToLayer, isIdentityTransform } from '@saier/core'

/**
 * Convert a dab from document space into the target layer's local pixel space.
 *
 * Brush math stays in document space (decision D2); only the final dab position
 * is mapped through the layer's inverse transform, and the radius is divided by
 * the average scale so it still reads as the requested document-px size.
 *
 * Known limitation: anisotropic scale / rotation makes the dab an ellipse; the
 * first version approximates it with the average scale (round dab). Tracked for
 * a follow-up if elliptical dabs become necessary.
 */
export function toLayerLocalDab(dab: BrushDab, transform: LayerTransform | undefined): BrushDab {
  if (isIdentityTransform(transform))
    return dab
  const local = documentToLayer({ x: dab.x, y: dab.y }, transform!)
  const scale = (Math.abs(transform!.scaleX) + Math.abs(transform!.scaleY)) / 2 || 1
  return { ...dab, x: local.x, y: local.y, radius: dab.radius / scale }
}
