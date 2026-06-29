import type { BrushDab, CompositeMode, DirtyRect } from '../types'
import type { TiledSurface } from './TiledSurface'
import { sampleBrushTipAlpha } from '../brush/tips'
import { clampToSize, fromCircle, isEmpty } from '../math'

/**
 * Rasterize one round dab into a CPU {@link TiledSurface}.
 *
 * Tiles store premultiplied RGBA bytes. `normal` uses source-over compositing;
 * `erase` uses destination-out. The implementation is deterministic and does
 * not depend on Pixi or browser canvas APIs.
 */
export interface RasterizeDabOptions {
  /** lock transparency: only recolour existing pixels, keep their alpha (P6-02) */
  lockAlpha?: boolean
}

export function rasterizeDab(
  surface: TiledSurface,
  dab: BrushDab,
  mode: CompositeMode,
  options: RasterizeDabOptions = {},
): DirtyRect {
  const dirty = clampToSize(fromCircle(dab.x, dab.y, dab.radius), surface.width, surface.height)
  if (isEmpty(dirty))
    return dirty

  const coverageAlpha = Math.max(0, Math.min(1, dab.opacity * dab.color.a))
  if (coverageAlpha <= 0)
    return emptyDirty()

  for (const coord of surface.tilesForRect(dirty)) {
    const tile = surface.ensureTile(coord.tileX, coord.tileY)
    const tileData = tile.ensureData()
    const tileRect = surface.tileRect(coord.tileX, coord.tileY)
    const left = Math.max(dirty.x, tileRect.x)
    const top = Math.max(dirty.y, tileRect.y)
    const right = Math.min(dirty.x + dirty.width, tileRect.x + tileRect.width)
    const bottom = Math.min(dirty.y + dirty.height, tileRect.y + tileRect.height)

    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const coverage = dabCoverage(x + 0.5, y + 0.5, dab)
        if (coverage <= 0)
          continue

        const srcAlpha = coverage * coverageAlpha
        const offset = ((y - coord.tileY * surface.tileSize) * surface.tileSize
          + (x - coord.tileX * surface.tileSize)) * 4

        if (mode === 'erase')
          compositeErase(tileData, offset, srcAlpha)
        else if (options.lockAlpha)
          compositeLockAlpha(tileData, offset, dab, srcAlpha)
        else if (dab.blendMode === 'max-alpha')
          compositeMaxAlpha(tileData, offset, dab, srcAlpha)
        else
          compositeSourceOver(tileData, offset, dab, srcAlpha)
      }
    }
  }

  surface.markDirty(dirty)
  return dirty
}

function dabCoverage(x: number, y: number, dab: BrushDab): number {
  const radius = dab.radius
  if (radius <= 0)
    return 0

  const dx = x - dab.x
  const dy = y - dab.y
  const rotation = -(dab.rotation ?? 0)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rx = (dx * cos - dy * sin) / radius
  const ry = (dx * sin + dy * cos) / radius

  return sampleBrushTipAlpha({
    tipId: dab.tipId,
    x: rx,
    y: ry,
    hardness: dab.hardness,
    edgeSize: 0.5 / radius,
  })
}

function compositeSourceOver(
  data: Uint8ClampedArray,
  offset: number,
  dab: BrushDab,
  srcAlpha: number,
): void {
  const inv = 1 - srcAlpha
  const srcR = Math.max(0, Math.min(1, dab.color.r)) * srcAlpha
  const srcG = Math.max(0, Math.min(1, dab.color.g)) * srcAlpha
  const srcB = Math.max(0, Math.min(1, dab.color.b)) * srcAlpha

  data[offset] = toByte(srcR + (data[offset]! / 255) * inv)
  data[offset + 1] = toByte(srcG + (data[offset + 1]! / 255) * inv)
  data[offset + 2] = toByte(srcB + (data[offset + 2]! / 255) * inv)
  data[offset + 3] = toByte(srcAlpha + (data[offset + 3]! / 255) * inv)
}

function compositeMaxAlpha(
  data: Uint8ClampedArray,
  offset: number,
  dab: BrushDab,
  srcAlpha: number,
): void {
  const dstAlpha = data[offset + 3]! / 255
  if (srcAlpha <= dstAlpha)
    return

  data[offset] = toByte(Math.max(0, Math.min(1, dab.color.r)) * srcAlpha)
  data[offset + 1] = toByte(Math.max(0, Math.min(1, dab.color.g)) * srcAlpha)
  data[offset + 2] = toByte(Math.max(0, Math.min(1, dab.color.b)) * srcAlpha)
  data[offset + 3] = toByte(srcAlpha)
}

function compositeLockAlpha(
  data: Uint8ClampedArray,
  offset: number,
  dab: BrushDab,
  srcAlpha: number,
): void {
  const dstAlpha = data[offset + 3]!
  if (dstAlpha <= 0)
    return
  const inv = 1 - srcAlpha
  const keep = srcAlpha * dstAlpha
  data[offset] = toByte((data[offset]! * inv + Math.max(0, Math.min(1, dab.color.r)) * keep) / 255)
  data[offset + 1] = toByte((data[offset + 1]! * inv + Math.max(0, Math.min(1, dab.color.g)) * keep) / 255)
  data[offset + 2] = toByte((data[offset + 2]! * inv + Math.max(0, Math.min(1, dab.color.b)) * keep) / 255)
  // alpha is preserved
}

function compositeErase(data: Uint8ClampedArray, offset: number, srcAlpha: number): void {
  const inv = 1 - srcAlpha
  data[offset] = toByte((data[offset]! / 255) * inv)
  data[offset + 1] = toByte((data[offset + 1]! / 255) * inv)
  data[offset + 2] = toByte((data[offset + 2]! / 255) * inv)
  data[offset + 3] = toByte((data[offset + 3]! / 255) * inv)
}

function toByte(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}

function emptyDirty(): DirtyRect {
  return { x: 0, y: 0, width: 0, height: 0 }
}

/**
 * Lock-alpha composite of a stroke region onto a destination region, both in
 * premultiplied RGBA bytes. The destination's alpha is preserved exactly and
 * only already-opaque pixels are recoloured (transparent areas never gain
 * paint). Returns a new buffer; inputs are not mutated.
 *
 * Derivation (premultiplied, `cov = strokeA/255`, dst alpha kept):
 *   out_pre = dst_pre·(1 − cov) + strokeStraight·cov·dstA
 *           = dst_pre·(1 − cov) + stroke_pre·dstA/255
 */
export function compositeLockAlphaRegion(dst: Uint8Array, stroke: Uint8Array): Uint8Array {
  const out = new Uint8Array(dst.length)
  for (let o = 0; o < dst.length; o += 4) {
    const dstAlpha = dst[o + 3]!
    const cov = stroke[o + 3]! / 255
    const inv = 1 - cov
    const keep = dstAlpha / 255
    out[o] = clampByte(dst[o]! * inv + stroke[o]! * keep)
    out[o + 1] = clampByte(dst[o + 1]! * inv + stroke[o + 1]! * keep)
    out[o + 2] = clampByte(dst[o + 2]! * inv + stroke[o + 2]! * keep)
    out[o + 3] = dstAlpha
  }
  return out
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
