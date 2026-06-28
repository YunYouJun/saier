import type { Emitter } from 'mitt'
import type { BlendMode, CreateLayerOptions, RasterLayer } from './RasterLayer'
import mitt from 'mitt'
import { createRasterLayer } from './RasterLayer'

export interface DocumentEvents {
  /** any structural or property change to the layer stack */
  'layers:change': { layers: RasterLayer[], activeLayerId: string | null }
  [key: string]: unknown
  [key: symbol]: unknown
}

export interface DocumentOptions {
  width: number
  height: number
}

/**
 * The framework-agnostic painting document: a stack of {@link RasterLayer}s
 * plus the active selection. UI / adapters subscribe via {@link on} rather than
 * reading the Pixi scene graph (decision D7).
 *
 * Layer ids are generated from a per-document counter (deterministic — no
 * `Math.random` / `Date.now`).
 */
export class Document {
  readonly width: number
  readonly height: number

  private readonly emitter: Emitter<DocumentEvents> = mitt<DocumentEvents>()
  private _layers: RasterLayer[] = []
  private _activeLayerId: string | null = null
  private idCounter = 0

  constructor(options: DocumentOptions) {
    this.width = options.width
    this.height = options.height
  }

  /** Layers ordered bottom → top. Returns a defensive copy. */
  get layers(): RasterLayer[] {
    return [...this._layers]
  }

  get activeLayerId(): string | null {
    return this._activeLayerId
  }

  get activeLayer(): RasterLayer | null {
    return this._activeLayerId ? this.getLayer(this._activeLayerId) ?? null : null
  }

  on = this.emitter.on
  off = this.emitter.off

  getLayer(id: string): RasterLayer | undefined {
    return this._layers.find(l => l.id === id)
  }

  /** Append a new layer on top and make it active. */
  addLayer(options: CreateLayerOptions = {}): RasterLayer {
    const id = options.id ?? this.nextId()
    if (this.getLayer(id))
      throw new Error(`Layer id already exists: ${id}`)

    const layer = createRasterLayer(id, options)
    this._layers.push(layer)
    this._activeLayerId = id
    this.emitChange()
    return layer
  }

  removeLayer(id: string): void {
    const index = this._layers.findIndex(l => l.id === id)
    if (index === -1)
      return
    this._layers.splice(index, 1)
    if (this._activeLayerId === id)
      this._activeLayerId = this._layers[this._layers.length - 1]?.id ?? null
    this.emitChange()
  }

  /** Move a layer to `toIndex` (clamped to bounds). */
  moveLayer(id: string, toIndex: number): void {
    const from = this._layers.findIndex(l => l.id === id)
    if (from === -1)
      return
    const to = Math.max(0, Math.min(this._layers.length - 1, toIndex))
    if (from === to)
      return
    const [layer] = this._layers.splice(from, 1)
    this._layers.splice(to, 0, layer!)
    this.emitChange()
  }

  setActive(id: string): void {
    if (!this.getLayer(id))
      throw new Error(`Cannot activate unknown layer: ${id}`)
    if (this._activeLayerId === id)
      return
    this._activeLayerId = id
    this.emitChange()
  }

  setOpacity(id: string, opacity: number): void {
    const layer = this.getLayer(id)
    if (!layer)
      return
    const next = Math.max(0, Math.min(1, opacity))
    if (layer.opacity === next)
      return
    layer.opacity = next
    this.emitChange()
  }

  setVisible(id: string, visible: boolean): void {
    const layer = this.getLayer(id)
    if (!layer || layer.visible === visible)
      return
    layer.visible = visible
    this.emitChange()
  }

  setBlendMode(id: string, blendMode: BlendMode): void {
    const layer = this.getLayer(id)
    if (!layer || layer.blendMode === blendMode)
      return
    layer.blendMode = blendMode
    this.emitChange()
  }

  setLabel(id: string, label: string): void {
    const layer = this.getLayer(id)
    const next = label.trim()
    if (!layer || !next || layer.label === next)
      return
    layer.label = next
    this.emitChange()
  }

  private nextId(): string {
    let id: string
    do {
      this.idCounter += 1
      id = `layer-${this.idCounter}`
    } while (this.getLayer(id))
    return id
  }

  private emitChange(): void {
    this.emitter.emit('layers:change', {
      layers: this.layers,
      activeLayerId: this._activeLayerId,
    })
  }
}
