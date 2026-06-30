import type {
  BrushDab,
  CompositeMode,
  DirtyRect,
  RGBA,
  StrokePatch,
  SurfaceBackend,
  SurfaceLayerState,
  SurfaceMemorySnapshot,
  SurfaceSampleRegionOptions,
  TileCoord,
  TiledSurface,
  TiledSurfaceDirtySnapshot,
} from '@saier/core'
import type { Renderer } from 'pixi.js'
import type { DisplayMaskCapableBackend, DisplayMaskMode } from './DisplayMaskBackend'
import {
  TiledSurface as CoreTiledSurface,
  empty,
  isEmpty,
  tileKey,
  TilePatchRecorder,
  union,
} from '@saier/core'
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js'

export interface PixiTileTextureBackendOptions {
  renderer: Renderer
  /** Container that owns layer containers. */
  stage: Container
  width?: number
  height?: number
  tileSize?: number
  /** Disable automatic requestAnimationFrame flushing in tests. */
  autoFlush?: boolean
}

interface TileDisplay {
  source: BufferImageSource
  texture: Texture
  sprite: Sprite
}

interface TileLayerRecord {
  id: string
  container: Container
  surface: TiledSurface
  displaySurface?: TiledSurface
  recorder: TilePatchRecorder
  displays: Map<string, TileDisplay>
  lockAlpha: boolean
  hidden: boolean
  /** when set, the container displays `displaySurface` instead of source tiles */
  displayMaskLayerId?: string
  /** how the mask layer masks this one (default `alpha` = clip; `luminance` = layer mask) */
  displayMaskMode?: DisplayMaskMode
}

export class PixiTileTextureBackend implements SurfaceBackend, DisplayMaskCapableBackend {
  readonly width: number
  readonly height: number
  readonly tileSize: number
  /** Upload count from the most recent flush; intentionally public for tests. */
  __uploadsThisFrame = 0
  uploadCount = 0

  private readonly stage: Container
  private readonly autoFlush: boolean
  private readonly layers = new Map<string, TileLayerRecord>()
  private activeLayerId: string | undefined
  private strokeMode: CompositeMode | undefined
  private rafId: number | undefined

  constructor(options: PixiTileTextureBackendOptions) {
    this.stage = options.stage
    this.width = options.width ?? options.renderer.width
    this.height = options.height ?? options.renderer.height
    this.tileSize = options.tileSize ?? 256
    this.autoFlush = options.autoFlush ?? true
  }

  createLayer(id: string): void {
    if (this.layers.has(id))
      throw new Error(`Layer already exists: ${id}`)

    const container = new Container()
    container.label = id
    const surface = new CoreTiledSurface({
      width: this.width,
      height: this.height,
      tileSize: this.tileSize,
    })
    const recorder = new TilePatchRecorder({ layerId: id, surface })

    this.stage.addChild(container)
    this.layers.set(id, {
      id,
      container,
      surface,
      recorder,
      displays: new Map(),
      lockAlpha: false,
      hidden: false,
    })
  }

  setLayerState(id: string, state: SurfaceLayerState): void {
    const layer = this.getLayer(id)
    if (state.visible !== undefined)
      layer.container.visible = state.visible
    if (state.opacity !== undefined)
      layer.container.alpha = Math.max(0, Math.min(1, state.opacity))
    if (state.blendMode !== undefined)
      layer.container.blendMode = state.blendMode
    if (state.lockAlpha !== undefined)
      layer.lockAlpha = state.lockAlpha
  }

  /** Whether a layer exists in this backend. */
  hasLayer(id: string): boolean {
    return this.layers.has(id)
  }

  /** Create a hidden surface (e.g. a layer mask): paintable, not shown directly. */
  createHiddenLayer(id: string): void {
    this.createLayer(id)
    const layer = this.getLayer(id)
    layer.hidden = true
    if (layer.container.parent)
      layer.container.parent.removeChild(layer.container)
  }

  /** Fill a layer fully opaque white (a fresh "reveal-all" mask). */
  fillLayerOpaque(id: string): void {
    const layer = this.getLayer(id)
    const full = this.fullDocumentRect()

    for (const coord of layer.surface.tilesForRect(full)) {
      const data = new Uint8ClampedArray(this.tileByteLength)
      const tileRect = layer.surface.tileRect(coord.tileX, coord.tileY)
      const origin = layer.surface.tileToDoc(coord.tileX, coord.tileY)

      for (let y = tileRect.y; y < tileRect.y + tileRect.height; y++) {
        for (let x = tileRect.x; x < tileRect.x + tileRect.width; x++) {
          const offset = ((y - origin.y) * this.tileSize + (x - origin.x)) * 4
          data[offset] = 255
          data[offset + 1] = 255
          data[offset + 2] = 255
          data[offset + 3] = 255
        }
      }

      layer.surface.writeTileData(coord.tileX, coord.tileY, data)
    }
  }

  /**
   * Display `layerId` masked by `maskLayerId`. Tile pixels remain the source of
   * truth; this computes a CPU-derived display surface and uploads those tiles.
   */
  setLayerDisplayMask(layerId: string, maskLayerId: string | undefined, mode: DisplayMaskMode = 'alpha'): void {
    const layer = this.getLayer(layerId)
    layer.displayMaskLayerId = maskLayerId
    layer.displayMaskMode = maskLayerId ? mode : undefined

    if (!maskLayerId) {
      layer.displaySurface?.clear()
      layer.displaySurface = undefined
      this.uploadLayerTiles(layer, this.fullDocumentRect())
      return
    }

    this.computeMaskedDisplay(layer, this.fullDocumentRect())
    this.uploadDirtyDisplaySurface(layer)
  }

  /** Recompute every masked layer's derived display (call after pixels change). */
  refreshDerivedDisplays(dirtyRect = this.fullDocumentRect()): void {
    for (const layer of this.layers.values()) {
      if (!layer.displayMaskLayerId)
        continue
      this.computeMaskedDisplay(layer, dirtyRect)
      this.uploadDirtyDisplaySurface(layer)
    }
  }

  reorderLayers(ids: string[]): void {
    // Stack tracked raster layers on top in document order, above any foreign
    // children (e.g. legacy image `EditableLayer`s). Absolute indices would push
    // those foreign children above newly added layers and hide their strokes.
    for (const id of ids) {
      const layer = this.layers.get(id)
      if (!layer || !layer.container.parent)
        continue
      this.stage.setChildIndex(layer.container, this.stage.children.length - 1)
    }
  }

  removeLayer(id: string): void {
    const layer = this.getLayer(id)
    if (layer.container.parent)
      layer.container.parent.removeChild(layer.container)
    for (const display of layer.displays.values())
      destroyDisplay(display)
    layer.displays.clear()
    layer.displaySurface?.clear()
    layer.container.destroy({ children: true })
    this.layers.delete(id)

    // Any layer masked by this one must fall back to showing its content.
    for (const other of this.layers.values()) {
      if (other.displayMaskLayerId === id)
        this.setLayerDisplayMask(other.id, undefined)
    }

    if (this.activeLayerId === id)
      this.endActiveStroke()
  }

  beginStroke(layerId: string): void {
    const layer = this.getLayer(layerId)
    layer.recorder.beginStroke()
    this.activeLayerId = layerId
    this.strokeMode = undefined
  }

  paintDab(layerId: string, dab: BrushDab, mode: CompositeMode): DirtyRect {
    if (this.activeLayerId !== layerId)
      this.beginStroke(layerId)
    if (this.strokeMode && this.strokeMode !== mode)
      throw new Error('Cannot mix composite modes within one stroke')
    this.strokeMode = mode

    const layer = this.getLayer(layerId)
    const dirty = layer.recorder.paintDab(dab, mode, layer.lockAlpha)
    if (!isEmpty(dirty))
      this.scheduleFlush()
    return dirty
  }

  sampleRegion(layerId: string, rect: DirtyRect, options?: SurfaceSampleRegionOptions): RGBA {
    return this.getLayer(layerId).surface.sampleRegion(rect, options)
  }

  endStroke(layerId: string): StrokePatch {
    const layer = this.getLayer(layerId)
    if (this.activeLayerId !== layerId) {
      return {
        layerId,
        rect: empty(),
        before: [],
        after: [],
      }
    }

    const patch = layer.recorder.endStroke()
    this.endActiveStroke()
    if (!isEmpty(patch.rect))
      this.scheduleFlush()
    return patch
  }

  applyPatch(patch: StrokePatch, dir: 'undo' | 'redo'): void {
    const layer = this.getLayer(patch.layerId)
    layer.recorder.applyPatch(patch, dir)
    this.scheduleFlush()
  }

  getDisplayHandle(layerId: string): unknown {
    return this.getLayer(layerId).container
  }

  getSurface(layerId: string): TiledSurface {
    return this.getLayer(layerId).surface
  }

  getMemorySnapshot(): SurfaceMemorySnapshot {
    const bytesPerTile = this.tileSize * this.tileSize * 4
    let allocatedTileCount = 0
    let derivedTileCount = 0
    let displayTileCount = 0

    for (const layer of this.layers.values()) {
      allocatedTileCount += layer.surface.allocatedTileCount
      derivedTileCount += layer.displaySurface?.allocatedTileCount ?? 0
      displayTileCount += layer.displays.size
    }

    const cpuBytes = (allocatedTileCount + derivedTileCount) * bytesPerTile
    const gpuBytes = displayTileCount * bytesPerTile

    return {
      source: 'tiled',
      width: this.width,
      height: this.height,
      totalEstimatedBytes: cpuBytes + gpuBytes,
      entries: [
        {
          id: 'surface:tiled-cpu-buffers',
          label: 'Allocated tile pixel buffers',
          bytes: cpuBytes,
          kind: 'cpu',
          count: allocatedTileCount + derivedTileCount,
          metadata: {
            allocatedTileCount,
            bytesPerTile,
            derivedTileCount,
            tileSize: this.tileSize,
          },
        },
        {
          id: 'surface:tiled-gpu-textures',
          label: 'Uploaded tile textures',
          bytes: gpuBytes,
          kind: 'gpu',
          count: displayTileCount,
          metadata: {
            bytesPerTile,
            tileSize: this.tileSize,
          },
        },
      ],
      metadata: {
        allocatedTileCount,
        derivedTileCount,
        displayTileCount,
        layerCount: this.layers.size,
        tileSize: this.tileSize,
      },
    }
  }

  flushUploads(): void {
    this.__uploadsThisFrame = 0

    const dirtyByLayer = new Map<string, TiledSurfaceDirtySnapshot>()
    for (const layer of this.layers.values()) {
      const dirty = layer.surface.flushDirty()
      dirtyByLayer.set(layer.id, dirty)
    }

    for (const layer of this.layers.values()) {
      if (!layer.displayMaskLayerId)
        continue

      const contentDirty = dirtyByLayer.get(layer.id)?.rect ?? empty()
      const maskDirty = dirtyByLayer.get(layer.displayMaskLayerId)?.rect ?? empty()
      const dirtyRect = union(contentDirty, maskDirty)
      if (!isEmpty(dirtyRect))
        this.computeMaskedDisplay(layer, dirtyRect)
    }

    for (const layer of this.layers.values()) {
      if (layer.displayMaskLayerId) {
        this.uploadDirtyDisplaySurface(layer)
        continue
      }

      if (layer.hidden)
        continue

      const dirty = dirtyByLayer.get(layer.id)
      if (!dirty)
        continue
      for (const coord of dirty.tiles)
        this.uploadTile(layer, coord)
    }

    this.uploadCount += this.__uploadsThisFrame
    this.rafId = undefined
  }

  destroy(): void {
    if (this.rafId !== undefined && typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(this.rafId)
    this.rafId = undefined

    this.endActiveStroke()
    for (const layer of this.layers.values()) {
      if (layer.container.parent)
        layer.container.parent.removeChild(layer.container)
      for (const display of layer.displays.values())
        destroyDisplay(display)
      layer.displays.clear()
      layer.displaySurface?.clear()
      layer.container.destroy({ children: true })
    }
    this.layers.clear()
  }

  private uploadTile(layer: TileLayerRecord, coord: TileCoord): void {
    const key = tileKey(coord.tileX, coord.tileY)
    const displaySurface = this.getDisplaySurface(layer)
    const tile = displaySurface?.getTile(coord.tileX, coord.tileY)
    if (!tile?.data || !tile.hasVisiblePixels()) {
      this.removeTileDisplay(layer, key)
      return
    }

    let display = layer.displays.get(key)
    if (!display || display.source.resource !== tile.data) {
      if (display)
        this.removeTileDisplay(layer, key)
      display = this.createTileDisplay(layer, coord, tile.data)
    }
    else {
      display.source.update()
    }

    this.__uploadsThisFrame += 1
  }

  private createTileDisplay(
    layer: TileLayerRecord,
    coord: TileCoord,
    data: Uint8ClampedArray,
  ): TileDisplay {
    const source = new BufferImageSource({
      resource: data,
      width: this.tileSize,
      height: this.tileSize,
      alphaMode: 'premultiplied-alpha',
    })
    const texture = new Texture({ source })
    const sprite = new Sprite(texture)
    const origin = layer.surface.tileToDoc(coord.tileX, coord.tileY)
    sprite.position.set(origin.x, origin.y)
    sprite.label = `tile:${coord.tileX},${coord.tileY}`
    layer.container.addChild(sprite)

    const display = { source, texture, sprite }
    layer.displays.set(tileKey(coord.tileX, coord.tileY), display)
    return display
  }

  private removeTileDisplay(layer: TileLayerRecord, key: string): void {
    const display = layer.displays.get(key)
    if (!display)
      return
    layer.container.removeChild(display.sprite)
    destroyDisplay(display)
    layer.displays.delete(key)
  }

  private computeMaskedDisplay(layer: TileLayerRecord, dirtyRect: DirtyRect): void {
    const maskLayer = layer.displayMaskLayerId ? this.layers.get(layer.displayMaskLayerId) : undefined
    if (!maskLayer) {
      this.setLayerDisplayMask(layer.id, undefined)
      return
    }

    const displaySurface = this.ensureDisplaySurface(layer)
    for (const coord of displaySurface.tilesForRect(dirtyRect)) {
      const content = layer.surface.getTile(coord.tileX, coord.tileY)?.data
      const mask = maskLayer.surface.getTile(coord.tileX, coord.tileY)?.data

      if (!content || !mask) {
        displaySurface.writeTileData(coord.tileX, coord.tileY, new Uint8ClampedArray(this.tileByteLength))
        continue
      }

      displaySurface.writeTileData(
        coord.tileX,
        coord.tileY,
        compositeMaskedTile(content, mask, layer.displayMaskMode ?? 'alpha'),
      )
    }
  }

  private ensureDisplaySurface(layer: TileLayerRecord): TiledSurface {
    layer.displaySurface ??= new CoreTiledSurface({
      width: this.width,
      height: this.height,
      tileSize: this.tileSize,
    })
    return layer.displaySurface
  }

  private getDisplaySurface(layer: TileLayerRecord): TiledSurface | undefined {
    return layer.displayMaskLayerId ? layer.displaySurface : layer.surface
  }

  private uploadLayerTiles(layer: TileLayerRecord, rect: DirtyRect): void {
    for (const coord of layer.surface.tilesForRect(rect))
      this.uploadTile(layer, coord)
  }

  private uploadDirtyDisplaySurface(layer: TileLayerRecord): void {
    const displaySurface = layer.displaySurface
    if (!displaySurface)
      return

    const dirty = displaySurface.flushDirty()
    for (const coord of dirty.tiles)
      this.uploadTile(layer, coord)
  }

  private fullDocumentRect(): DirtyRect {
    return { x: 0, y: 0, width: this.width, height: this.height }
  }

  private get tileByteLength(): number {
    return this.tileSize * this.tileSize * 4
  }

  private scheduleFlush(): void {
    if (!this.autoFlush || this.rafId !== undefined || typeof requestAnimationFrame === 'undefined')
      return
    this.rafId = requestAnimationFrame(() => this.flushUploads())
  }

  private endActiveStroke(): void {
    this.activeLayerId = undefined
    this.strokeMode = undefined
  }

  private getLayer(id: string): TileLayerRecord {
    const layer = this.layers.get(id)
    if (!layer)
      throw new Error(`Unknown layer: ${id}`)
    return layer
  }
}

function destroyDisplay(display: TileDisplay): void {
  display.sprite.destroy()
  display.texture.destroy(true)
}

function compositeMaskedTile(
  content: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  mode: DisplayMaskMode,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(content.length)

  for (let offset = 0; offset < content.length; offset += 4) {
    const contentAlpha = content[offset + 3] ?? 0
    if (contentAlpha <= 0)
      continue

    const reveal = mode === 'luminance'
      ? ((mask[offset] ?? 0) * 0.299 + (mask[offset + 1] ?? 0) * 0.587 + (mask[offset + 2] ?? 0) * 0.114) / 255
      : (mask[offset + 3] ?? 0) / 255

    if (reveal <= 0)
      continue

    out[offset] = toByte((content[offset] ?? 0) * reveal)
    out[offset + 1] = toByte((content[offset + 1] ?? 0) * reveal)
    out[offset + 2] = toByte((content[offset + 2] ?? 0) * reveal)
    out[offset + 3] = toByte(contentAlpha * reveal)
  }

  return out
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
