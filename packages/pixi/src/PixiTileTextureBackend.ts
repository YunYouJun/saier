import type {
  BrushDab,
  CompositeMode,
  DirtyRect,
  StrokePatch,
  SurfaceBackend,
  SurfaceLayerState,
  SurfaceMemorySnapshot,
  TileCoord,
  TiledSurface,
} from '@saier/core'
import type { Renderer } from 'pixi.js'
import {
  TiledSurface as CoreTiledSurface,
  empty,
  isEmpty,
  tileKey,
  TilePatchRecorder,
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
  recorder: TilePatchRecorder
  displays: Map<string, TileDisplay>
  lockAlpha: boolean
}

export class PixiTileTextureBackend implements SurfaceBackend {
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
    this.stage.removeChild(layer.container)
    for (const display of layer.displays.values())
      destroyDisplay(display)
    layer.displays.clear()
    layer.container.destroy({ children: true })
    this.layers.delete(id)

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
    let displayTileCount = 0

    for (const layer of this.layers.values()) {
      allocatedTileCount += layer.surface.allocatedTileCount
      displayTileCount += layer.displays.size
    }

    const cpuBytes = allocatedTileCount * bytesPerTile
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
          count: allocatedTileCount,
          metadata: {
            bytesPerTile,
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
        displayTileCount,
        layerCount: this.layers.size,
        tileSize: this.tileSize,
      },
    }
  }

  flushUploads(): void {
    this.__uploadsThisFrame = 0

    for (const layer of this.layers.values()) {
      const dirty = layer.surface.flushDirty()
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
      this.stage.removeChild(layer.container)
      for (const display of layer.displays.values())
        destroyDisplay(display)
      layer.displays.clear()
      layer.container.destroy({ children: true })
    }
    this.layers.clear()
  }

  private uploadTile(layer: TileLayerRecord, coord: TileCoord): void {
    const key = tileKey(coord.tileX, coord.tileY)
    const tile = layer.surface.getTile(coord.tileX, coord.tileY)
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
