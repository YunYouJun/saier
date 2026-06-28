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
 * The framework-agnostic, **pixel-free** record of a raster layer.
 *
 * Pixels live in the {@link SurfaceBackend} (decision D5); this only holds the
 * layer's logical state (identity, order is implied by position in
 * `Document.layers`, opacity, visibility, blend mode).
 */
export interface RasterLayer {
  readonly id: string
  label: string
  visible: boolean
  /** `0..1` */
  opacity: number
  blendMode: BlendMode
}

export interface CreateLayerOptions {
  id?: string
  label?: string
  visible?: boolean
  opacity?: number
  blendMode?: BlendMode
}

export function createRasterLayer(id: string, options: CreateLayerOptions = {}): RasterLayer {
  return {
    id,
    label: options.label ?? id,
    visible: options.visible ?? true,
    opacity: clamp01(options.opacity ?? 1),
    blendMode: options.blendMode ?? 'normal',
  }
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}
