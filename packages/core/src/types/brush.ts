import type { BrushInputPoint } from './input'

/** Straight (non-premultiplied) RGBA, each channel in `0..1`. */
export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

export type BrushDabBlendMode = 'source-over' | 'max-alpha'

/**
 * A single stamp ("dab") the brush deposits onto the surface.
 *
 * Positions and radius are in **document space**; the backend resolves them to
 * device pixels at render time (decision D2).
 */
export interface BrushDab {
  /** dab center x, document space */
  x: number
  /** dab center y, document space */
  y: number
  /** dab radius, document px */
  radius: number
  /** single-dab opacity `0..1`, used for accumulation */
  opacity: number
  color: RGBA
  /** edge softness `0..1` (0 = hard, 1 = soft); backend-defined default */
  hardness?: number
  /** dab rotation in radians, for non-round tips */
  rotation?: number
  /** stamp-tip texture id, for textured brushes */
  tipId?: string
  /**
   * Per-stroke dab accumulation mode.
   *
   * `max-alpha` is used by marker-like brushes: dabs inside the same stroke
   * keep the strongest coverage instead of repeatedly darkening, while the
   * finished stroke still composites over the layer normally.
   */
  blendMode?: BrushDabBlendMode
}

/** Resolved per-stroke context handed to the engine at `beginStroke`. */
export interface BrushContext {
  color: RGBA
  /** base brush size, document px */
  baseSize: number
  // Resolved dynamics (pressure->size/opacity), spacing, stabilizer strength, …
  // are added as the engine grows (P3/P4).
}

/**
 * A brush only produces dabs; it never knows which backend they land on.
 *
 * Multiple implementations coexist behind this same interface
 * (SimpleBrushEngine, CalligraphyEngine, MyPaintBrushEngineWasm, …).
 */
export interface BrushEngine {
  beginStroke: (ctx: BrushContext) => void
  /** may emit `0..n` dabs depending on spacing */
  addPoint: (point: BrushInputPoint) => BrushDab[]
  /** trailing dabs for stroke end / taper */
  endStroke: () => BrushDab[]
}
