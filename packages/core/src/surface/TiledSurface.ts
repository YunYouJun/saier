import type { DirtyRect, RGBA, SurfaceSampleRegionOptions } from '../types'
import type { SurfaceMemorySnapshot } from '../types/memory'
import { clampToSize, empty, isEmpty, union } from '../math'
import { averagePremultiplied } from './sampler'
import { Tile } from './Tile'

export interface TileCoord {
  tileX: number
  tileY: number
}

export interface TileDocOrigin {
  x: number
  y: number
}

export interface TiledSurfaceDirtySnapshot {
  rect: DirtyRect
  tiles: TileCoord[]
}

export interface TiledSurfaceOptions {
  width: number
  height: number
  tileSize?: number
}

export type TileVisitor = (tile: Tile | undefined, coord: TileCoord) => void

const DEFAULT_TILE_SIZE = 256

export class TiledSurface {
  readonly width: number
  readonly height: number
  readonly tileSize: number

  private readonly tiles = new Map<string, Tile>()
  private readonly dirtyTiles = new Set<string>()
  private dirtyRect: DirtyRect = empty()

  constructor(options: TiledSurfaceOptions) {
    this.width = options.width
    this.height = options.height
    this.tileSize = options.tileSize ?? DEFAULT_TILE_SIZE

    if (this.width <= 0 || this.height <= 0)
      throw new Error('TiledSurface dimensions must be positive')
    if (this.tileSize <= 0)
      throw new Error('TiledSurface tileSize must be positive')
  }

  get allocatedTileCount(): number {
    return this.tiles.size
  }

  get allocatedTiles(): Tile[] {
    return [...this.tiles.values()]
  }

  get dirtyTileCount(): number {
    return this.dirtyTiles.size
  }

  docToTile(x: number, y: number): TileCoord {
    return {
      tileX: Math.floor(x / this.tileSize),
      tileY: Math.floor(y / this.tileSize),
    }
  }

  tileToDoc(tileX: number, tileY: number): TileDocOrigin {
    return {
      x: tileX * this.tileSize,
      y: tileY * this.tileSize,
    }
  }

  tilesForRect(rect: DirtyRect): TileCoord[] {
    const normalized = this.normalizeRect(rect)
    if (isEmpty(normalized))
      return []

    const min = this.docToTile(normalized.x, normalized.y)
    const max = this.docToTile(
      normalized.x + normalized.width - 1,
      normalized.y + normalized.height - 1,
    )
    const coords: TileCoord[] = []

    for (let tileY = min.tileY; tileY <= max.tileY; tileY++) {
      for (let tileX = min.tileX; tileX <= max.tileX; tileX++)
        coords.push({ tileX, tileY })
    }

    return coords
  }

  forEachTileInRect(rect: DirtyRect, cb: TileVisitor): void {
    for (const coord of this.tilesForRect(rect))
      cb(this.getTile(coord.tileX, coord.tileY), coord)
  }

  getTile(tileX: number, tileY: number): Tile | undefined {
    return this.tiles.get(tileKey(tileX, tileY))
  }

  hasTile(tileX: number, tileY: number): boolean {
    return this.tiles.has(tileKey(tileX, tileY))
  }

  ensureTile(tileX: number, tileY: number): Tile {
    const key = tileKey(tileX, tileY)
    let tile = this.tiles.get(key)
    if (!tile) {
      tile = new Tile({ tileX, tileY, tileSize: this.tileSize })
      this.tiles.set(key, tile)
    }
    tile.ensureData()
    return tile
  }

  deleteTile(tileX: number, tileY: number): void {
    this.tiles.delete(tileKey(tileX, tileY))
  }

  cloneTileData(tileX: number, tileY: number): Uint8ClampedArray {
    const tile = this.getTile(tileX, tileY)
    return tile ? tile.cloneData() : new Uint8ClampedArray(this.tileByteLength)
  }

  writeTileData(tileX: number, tileY: number, data: Uint8ClampedArray): void {
    if (data.length !== this.tileByteLength) {
      throw new Error(
        `Tile data length ${data.length} does not match tileSize ${this.tileSize}`,
      )
    }

    if (isTransparent(data)) {
      this.deleteTile(tileX, tileY)
    }
    else {
      const tile = this.ensureTile(tileX, tileY)
      tile.ensureData().set(data)
    }

    this.markDirty(this.tileRect(tileX, tileY))
  }

  readRegion(rect: DirtyRect): Uint8ClampedArray {
    const normalized = this.normalizeRect(rect)
    if (isEmpty(normalized))
      return new Uint8ClampedArray()

    const out = new Uint8ClampedArray(byteLengthForRect(normalized))

    this.copyRegion(normalized, (tile, source, target) => {
      if (!tile?.data)
        return
      for (let row = 0; row < source.height; row++) {
        const srcOffset = tileOffset(source.x, source.y + row, this.tileSize)
        const dstOffset = regionOffset(target.x, target.y + row, normalized.width)
        const widthBytes = source.width * 4
        out.set(tile.data.subarray(srcOffset, srcOffset + widthBytes), dstOffset)
      }
    })

    return out
  }

  sampleRegion(rect: DirtyRect, options: SurfaceSampleRegionOptions = {}): RGBA {
    const normalized = normalizeSampleRect(rect)
    if (isEmpty(normalized))
      return { r: 0, g: 0, b: 0, a: 0 }

    const pixels = this.readRegionWithTransparentBounds(normalized)
    return averagePremultiplied(pixels, normalized.width, normalized.height, {
      ...options,
      rect: normalized,
    })
  }

  writeRegion(rect: DirtyRect, data: Uint8ClampedArray): void {
    const normalized = this.normalizeRect(rect)
    if (isEmpty(normalized)) {
      if (data.length !== 0)
        throw new Error('Cannot write non-empty data into an empty region')
      return
    }
    if (data.length !== byteLengthForRect(normalized)) {
      throw new Error(
        `Region data length ${data.length} does not match rect ${normalized.width}x${normalized.height}`,
      )
    }

    this.copyRegion(normalized, (_tile, source, target, coord) => {
      const tile = this.ensureTile(coord.tileX, coord.tileY)
      const tileData = tile.ensureData()
      for (let row = 0; row < source.height; row++) {
        const srcOffset = regionOffset(target.x, target.y + row, normalized.width)
        const dstOffset = tileOffset(source.x, source.y + row, this.tileSize)
        const widthBytes = source.width * 4
        tileData.set(data.subarray(srcOffset, srcOffset + widthBytes), dstOffset)
      }
    })

    this.markDirty(normalized)
  }

  markDirty(rect: DirtyRect): void {
    const normalized = this.normalizeRect(rect)
    if (isEmpty(normalized))
      return

    for (const coord of this.tilesForRect(normalized))
      this.dirtyTiles.add(tileKey(coord.tileX, coord.tileY))
    this.dirtyRect = union(this.dirtyRect, normalized)
  }

  flushDirty(): TiledSurfaceDirtySnapshot {
    const snapshot = {
      rect: { ...this.dirtyRect },
      tiles: [...this.dirtyTiles].map(parseTileKey).sort(compareTileCoords),
    }

    this.dirtyTiles.clear()
    this.dirtyRect = empty()

    return snapshot
  }

  clear(): void {
    this.tiles.clear()
    this.dirtyTiles.clear()
    this.dirtyRect = empty()
  }

  getMemorySnapshot(id = 'tiled-surface'): SurfaceMemorySnapshot {
    const allocatedTileCount = this.allocatedTileCount
    const bytes = allocatedTileCount * this.tileByteLength

    return {
      source: 'tiled-surface',
      width: this.width,
      height: this.height,
      totalEstimatedBytes: bytes,
      entries: [
        {
          id: `${id}:allocated-tiles`,
          label: 'Allocated tile pixel buffers',
          bytes,
          kind: 'cpu',
          count: allocatedTileCount,
          metadata: {
            tileSize: this.tileSize,
          },
        },
      ],
      metadata: {
        allocatedTileCount,
        tileSize: this.tileSize,
      },
    }
  }

  tileRect(tileX: number, tileY: number): DirtyRect {
    const origin = this.tileToDoc(tileX, tileY)
    return clampToSize(
      { x: origin.x, y: origin.y, width: this.tileSize, height: this.tileSize },
      this.width,
      this.height,
    )
  }

  private get tileByteLength(): number {
    return this.tileSize * this.tileSize * 4
  }

  private normalizeRect(rect: DirtyRect): DirtyRect {
    if (isEmpty(rect))
      return empty()

    const x = Math.floor(rect.x)
    const y = Math.floor(rect.y)
    const right = Math.ceil(rect.x + rect.width)
    const bottom = Math.ceil(rect.y + rect.height)
    return clampToSize({ x, y, width: right - x, height: bottom - y }, this.width, this.height)
  }

  private readRegionWithTransparentBounds(rect: DirtyRect): Uint8ClampedArray {
    const out = new Uint8ClampedArray(byteLengthForRect(rect))
    const clipped = clampToSize(rect, this.width, this.height)
    if (isEmpty(clipped))
      return out

    const clippedData = this.readRegion(clipped)
    const targetX = clipped.x - rect.x
    const targetY = clipped.y - rect.y

    for (let row = 0; row < clipped.height; row++) {
      const srcOffset = regionOffset(0, row, clipped.width)
      const dstOffset = regionOffset(targetX, targetY + row, rect.width)
      const widthBytes = clipped.width * 4
      out.set(clippedData.subarray(srcOffset, srcOffset + widthBytes), dstOffset)
    }

    return out
  }

  private copyRegion(
    rect: DirtyRect,
    cb: (
      tile: Tile | undefined,
      source: DirtyRect,
      target: DirtyRect,
      coord: TileCoord,
    ) => void,
  ): void {
    for (const coord of this.tilesForRect(rect)) {
      const origin = this.tileToDoc(coord.tileX, coord.tileY)
      const left = Math.max(rect.x, origin.x)
      const top = Math.max(rect.y, origin.y)
      const right = Math.min(rect.x + rect.width, origin.x + this.tileSize)
      const bottom = Math.min(rect.y + rect.height, origin.y + this.tileSize)
      const width = right - left
      const height = bottom - top

      cb(
        this.getTile(coord.tileX, coord.tileY),
        { x: left - origin.x, y: top - origin.y, width, height },
        { x: left - rect.x, y: top - rect.y, width, height },
        coord,
      )
    }
  }
}

export function tileKey(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`
}

function parseTileKey(key: string): TileCoord {
  const [tileX, tileY] = key.split(',').map(Number)
  return { tileX: tileX ?? 0, tileY: tileY ?? 0 }
}

function compareTileCoords(a: TileCoord, b: TileCoord): number {
  return a.tileY - b.tileY || a.tileX - b.tileX
}

function byteLengthForRect(rect: DirtyRect): number {
  return rect.width * rect.height * 4
}

function normalizeSampleRect(rect: DirtyRect): DirtyRect {
  if (isEmpty(rect))
    return empty()

  const x = Math.floor(rect.x)
  const y = Math.floor(rect.y)
  const right = Math.ceil(rect.x + rect.width)
  const bottom = Math.ceil(rect.y + rect.height)
  if (right <= x || bottom <= y)
    return empty()
  return { x, y, width: right - x, height: bottom - y }
}

function tileOffset(x: number, y: number, tileSize: number): number {
  return (y * tileSize + x) * 4
}

function regionOffset(x: number, y: number, regionWidth: number): number {
  return (y * regionWidth + x) * 4
}

function isTransparent(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0)
      return false
  }
  return true
}
