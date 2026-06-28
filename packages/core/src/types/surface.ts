import type { BlendMode } from '../document/RasterLayer'
import type { BrushDab } from './brush'
import type { SurfaceMemorySnapshot } from './memory'

/** An axis-aligned dirty region in document space. */
export interface DirtyRect {
  x: number
  y: number
  width: number
  height: number
}

export type CompositeMode = 'normal' | 'erase'

/**
 * A single tile's before/after pixels (P2 tile undo).
 *
 * Declared now so the `SurfaceBackend` contract is stable across P1/P2;
 * the tile implementation itself lands in P2.
 */
export interface TilePatch {
  layerId: string
  tileX: number
  tileY: number
  before: Uint8Array
  after: Uint8Array
}

/**
 * An undo unit. P1 = region bitmap snapshot; P2 = array of tile patches.
 * The shape is transparent to `UndoManager` — it only round-trips it through
 * `applyPatch`.
 */
export interface StrokePatch {
  layerId: string
  rect: DirtyRect
  before: ImageBitmap | Uint8Array | TilePatch[]
  after: ImageBitmap | Uint8Array | TilePatch[]
}

export interface SurfaceLayerState {
  visible?: boolean
  /** display opacity in `0..1`; stored pixels remain unchanged */
  opacity?: number
  blendMode?: BlendMode
}

/**
 * The **only** pixel interface between core and the renderer.
 *
 * core never depends on any Pixi type — `getDisplayHandle` returns `unknown`
 * (decision D5). A Pixi RenderTexture backend (P1), tile backend (P2),
 * Canvas2D / WebGPU backends all satisfy this same contract.
 */
export interface SurfaceBackend {
  readonly width: number
  readonly height: number

  createLayer: (id: string) => void
  removeLayer: (id: string) => void
  setLayerState?: (id: string, state: SurfaceLayerState) => void
  reorderLayers?: (ids: string[]) => void

  beginStroke: (layerId: string) => void
  /** stamp one dab; returns the dab's dirty region */
  paintDab: (layerId: string, dab: BrushDab, mode: CompositeMode) => DirtyRect
  /** commit the stroke, returning a before/after patch for undo */
  endStroke: (layerId: string) => StrokePatch

  applyPatch: (patch: StrokePatch, dir: 'undo' | 'redo') => void

  /**
   * Force any deferred GPU uploads (batched dirty tiles, in-stroke preview)
   * synchronously. Backends that render eagerly may omit it.
   */
  flushUploads?: () => void

  /**
   * Return an estimated resource snapshot for memory diagnostics.
   *
   * This only reports resources the backend owns and can explain. Browser
   * process memory / GPU residency remain best-effort diagnostics outside this
   * contract.
   */
  getMemorySnapshot?: () => SurfaceMemorySnapshot

  /** opaque display handle (e.g. a Pixi Sprite); core does not type it */
  getDisplayHandle: (layerId: string) => unknown

  /** release renderer-owned resources associated with the surface */
  destroy: () => void
}
