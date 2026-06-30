import type { DirtyRect, RGBA, SurfaceSampleRegionOptions } from '../types'
import { sampleBrushTipAlpha } from '../brush/tips'

export interface AveragePremultipliedOptions extends SurfaceSampleRegionOptions {
  /** Document-space rect represented by the pixel buffer. Required for dab weights. */
  rect?: DirtyRect
}

/**
 * Average premultiplied RGBA bytes and return straight RGBA. Transparent pixels
 * reduce average alpha but do not pull RGB toward black.
 */
export function averagePremultiplied(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: AveragePremultipliedOptions = {},
): RGBA {
  if (width <= 0 || height <= 0 || pixels.length === 0)
    return transparent()

  let weightSum = 0
  let alphaSum = 0
  let rSum = 0
  let gSum = 0
  let bSum = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const weight = sampleWeight(x, y, options)
      if (weight <= 0)
        continue

      const offset = (y * width + x) * 4
      const alpha = (pixels[offset + 3] ?? 0) / 255

      weightSum += weight
      alphaSum += alpha * weight

      if (alpha <= 0)
        continue

      rSum += ((pixels[offset] ?? 0) / 255) * weight
      gSum += ((pixels[offset + 1] ?? 0) / 255) * weight
      bSum += ((pixels[offset + 2] ?? 0) / 255) * weight
    }
  }

  if (weightSum <= 0 || alphaSum <= 0)
    return transparent()

  return {
    r: clamp01(rSum / alphaSum),
    g: clamp01(gSum / alphaSum),
    b: clamp01(bSum / alphaSum),
    a: clamp01(alphaSum / weightSum),
  }
}

function sampleWeight(
  x: number,
  y: number,
  options: AveragePremultipliedOptions,
): number {
  const dab = options.dab
  if (!dab)
    return 1

  const rect = options.rect
  if (!rect)
    return 1

  const radius = dab.radius
  if (radius <= 0)
    return 0

  const px = rect.x + x + 0.5
  const py = rect.y + y + 0.5
  const dx = px - dab.x
  const dy = py - dab.y
  const rotation = -(dab.rotation ?? 0)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return sampleBrushTipAlpha({
    tipId: dab.tipId,
    x: (dx * cos - dy * sin) / radius,
    y: (dx * sin + dy * cos) / radius,
    hardness: dab.hardness,
    edgeSize: 0.5 / radius,
  })
}

function transparent(): RGBA {
  return { r: 0, g: 0, b: 0, a: 0 }
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}
