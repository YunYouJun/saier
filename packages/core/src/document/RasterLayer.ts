import type { LayerTransform } from '../math'

/** Display blend mode for a layer (stored pixels stay independent). */
export type BlendMode
  = | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'add'

/**
 * Reference to a layer's mask. The mask pixels live in the
 * {@link SurfaceBackend} (under a derived id); this only records the link and
 * whether it currently affects display (P6-04 wires the pixels).
 */
export interface LayerMaskRef {
  /** surface id holding the mask pixels (convention: `${layerId}:mask`) */
  id: string
  enabled: boolean
}

/**
 * The framework-agnostic, **pixel-free** record of a raster layer.
 *
 * Pixels live in the {@link SurfaceBackend} (decision D5); this only holds the
 * layer's logical state (identity, order is implied by position in
 * `Document.layers`, opacity, visibility, blend mode).
 */
export interface RasterLayer {
  readonly type: 'raster'
  readonly id: string
  label: string
  visible: boolean
  /** `0..1` */
  opacity: number
  blendMode: BlendMode
  /** lock transparency: painting only changes existing pixels' colour (P6-02) */
  lockAlpha: boolean
  /** clip to the layer below's alpha (P6-03) */
  clip: boolean
  /** own affine placement in document space; absent ⇒ identity (P6-05) */
  transform?: LayerTransform
  /** optional mask (P6-04) */
  mask?: LayerMaskRef
}

/**
 * A pass-through grouping node. Groups do not own pixels in v1; they only
 * organize raster layers and contribute effective visibility for rendering.
 */
export interface LayerGroup {
  readonly type: 'group'
  readonly id: string
  label: string
  visible: boolean
  collapsed: boolean
  children: LayerNode[]
}

export type LayerNode = RasterLayer | LayerGroup

export interface CreateLayerOptions {
  id?: string
  label?: string
  visible?: boolean
  opacity?: number
  blendMode?: BlendMode
  lockAlpha?: boolean
  clip?: boolean
  transform?: LayerTransform
  parentId?: string | null
  index?: number
}

export interface CreateLayerGroupOptions {
  id?: string
  label?: string
  visible?: boolean
  collapsed?: boolean
  parentId?: string | null
  index?: number
}

export function createRasterLayer(id: string, options: CreateLayerOptions = {}): RasterLayer {
  return {
    type: 'raster',
    id,
    label: options.label ?? id,
    visible: options.visible ?? true,
    opacity: clamp01(options.opacity ?? 1),
    blendMode: options.blendMode ?? 'normal',
    lockAlpha: options.lockAlpha ?? false,
    clip: options.clip ?? false,
    ...(options.transform ? { transform: options.transform } : {}),
  }
}

export function createLayerGroup(id: string, options: CreateLayerGroupOptions = {}): LayerGroup {
  return {
    type: 'group',
    id,
    label: options.label ?? id,
    visible: options.visible ?? true,
    collapsed: options.collapsed ?? false,
    children: [],
  }
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}
