export interface TileOptions {
  tileX: number
  tileY: number
  tileSize: number
}

/**
 * A lazily allocated RGBA tile.
 *
 * `data === null` means the tile is fully transparent and has never been
 * written. The first write calls {@link ensureData}; this keeps large sparse
 * documents from paying memory for untouched regions.
 */
export class Tile {
  readonly tileX: number
  readonly tileY: number
  readonly tileSize: number
  data: Uint8ClampedArray | null = null

  constructor(options: TileOptions) {
    this.tileX = options.tileX
    this.tileY = options.tileY
    this.tileSize = options.tileSize
  }

  get byteLength(): number {
    return this.tileSize * this.tileSize * 4
  }

  ensureData(): Uint8ClampedArray {
    this.data ??= new Uint8ClampedArray(this.byteLength)
    return this.data
  }

  cloneData(): Uint8ClampedArray {
    return this.data ? new Uint8ClampedArray(this.data) : new Uint8ClampedArray(this.byteLength)
  }

  hasVisiblePixels(): boolean {
    if (!this.data)
      return false
    for (let i = 3; i < this.data.length; i += 4) {
      if (this.data[i] !== 0)
        return true
    }
    return false
  }

  clear(): void {
    this.data = null
  }
}
