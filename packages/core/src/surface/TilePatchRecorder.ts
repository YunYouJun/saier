import type { BrushDab, CompositeMode, DirtyRect, StrokePatch, TilePatch } from '../types'
import { clampToSize, empty, fromCircle, isEmpty, union } from '../math'
import { rasterizeDab } from './rasterizer'
import { TiledSurface, tileKey } from './TiledSurface'

export interface TilePatchRecorderOptions {
  layerId: string
  surface: TiledSurface
}

/**
 * Stroke-scoped tile undo recorder.
 *
 * It snapshots each tile only once, just before the first dab in the stroke
 * can touch it. `endStroke` pairs those before snapshots with after snapshots
 * from the same tiles, so undo/redo only copies dirty tiles.
 */
export class TilePatchRecorder {
  readonly layerId: string
  readonly surface: TiledSurface

  private readonly before = new Map<string, Uint8Array>()
  private dirty: DirtyRect = empty()
  private maxAlphaSurface: TiledSurface | null = null

  constructor(options: TilePatchRecorderOptions) {
    this.layerId = options.layerId
    this.surface = options.surface
  }

  beginStroke(): void {
    this.before.clear()
    this.dirty = empty()
    this.maxAlphaSurface = null
  }

  paintDab(dab: BrushDab, mode: CompositeMode, lockAlpha = false): DirtyRect {
    const rect = clampToSize(fromCircle(dab.x, dab.y, dab.radius), this.surface.width, this.surface.height)
    if (isEmpty(rect) || dab.opacity * dab.color.a <= 0)
      return empty()

    this.captureBefore(rect)
    const dirty = this.paintIntoStrokeSurface(dab, mode, lockAlpha)
    this.dirty = union(this.dirty, dirty)
    return dirty
  }

  endStroke(): StrokePatch {
    if (this.maxAlphaSurface)
      this.commitMaxAlphaSurface()

    if (this.before.size === 0 || isEmpty(this.dirty)) {
      this.beginStroke()
      return {
        layerId: this.layerId,
        rect: empty(),
        before: [],
        after: [],
      }
    }

    const patches = [...this.before].map(([key, before]) => {
      const [tileX, tileY] = parseTileKey(key)
      return {
        layerId: this.layerId,
        tileX,
        tileY,
        before,
        after: toUint8Array(this.surface.cloneTileData(tileX, tileY)),
      } satisfies TilePatch
    })

    const rect = this.dirty
    this.beginStroke()

    return {
      layerId: this.layerId,
      rect,
      before: patches,
      after: patches,
    }
  }

  applyPatch(patch: StrokePatch, dir: 'undo' | 'redo'): void {
    if (patch.layerId !== this.layerId)
      throw new Error(`Tile patch layer mismatch: expected ${this.layerId}, got ${patch.layerId}`)

    for (const tilePatch of assertTilePatches(patch)) {
      const data = dir === 'undo' ? tilePatch.before : tilePatch.after
      this.surface.writeTileData(
        tilePatch.tileX,
        tilePatch.tileY,
        new Uint8ClampedArray(data),
      )
    }
  }

  private captureBefore(rect: DirtyRect): void {
    for (const coord of this.surface.tilesForRect(rect)) {
      const key = tileKey(coord.tileX, coord.tileY)
      if (this.before.has(key))
        continue
      this.before.set(
        key,
        toUint8Array(this.surface.cloneTileData(coord.tileX, coord.tileY)),
      )
    }
  }

  private paintIntoStrokeSurface(dab: BrushDab, mode: CompositeMode, lockAlpha: boolean): DirtyRect {
    if (mode !== 'normal' || dab.blendMode !== 'max-alpha')
      return rasterizeDab(this.surface, dab, mode, { lockAlpha })

    if (!this.maxAlphaSurface) {
      this.maxAlphaSurface = new TiledSurface({
        width: this.surface.width,
        height: this.surface.height,
        tileSize: this.surface.tileSize,
      })
    }

    return rasterizeDab(this.maxAlphaSurface, dab, 'normal')
  }

  private commitMaxAlphaSurface(): void {
    if (!this.maxAlphaSurface || isEmpty(this.dirty))
      return

    const rect = this.dirty
    const source = this.maxAlphaSurface.readRegion(rect)
    const target = this.surface.readRegion(rect)

    for (let offset = 0; offset < source.length; offset += 4) {
      const srcAlpha = source[offset + 3]! / 255
      if (srcAlpha <= 0)
        continue

      const inv = 1 - srcAlpha
      target[offset] = toByte(source[offset]! / 255 + (target[offset]! / 255) * inv)
      target[offset + 1] = toByte(source[offset + 1]! / 255 + (target[offset + 1]! / 255) * inv)
      target[offset + 2] = toByte(source[offset + 2]! / 255 + (target[offset + 2]! / 255) * inv)
      target[offset + 3] = toByte(srcAlpha + (target[offset + 3]! / 255) * inv)
    }

    this.surface.writeRegion(rect, target)
  }
}

export function assertTilePatches(patch: StrokePatch): TilePatch[] {
  if (Array.isArray(patch.before))
    return patch.before
  throw new TypeError('Expected StrokePatch.before to contain TilePatch[]')
}

function toUint8Array(data: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(data)
}

function parseTileKey(key: string): [number, number] {
  const [tileX, tileY] = key.split(',').map(Number)
  return [tileX ?? 0, tileY ?? 0]
}

function toByte(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
}
