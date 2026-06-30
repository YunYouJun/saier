import type { PressureCurve, PressureCurveConfig } from '../input'
import type {
  BrushContext,
  BrushDab,
  BrushDabBlendMode,
  BrushEngine,
  BrushInputPoint,
} from '../types'
import { clamp01, createPressureCurve } from '../input'

/** Maps normalized pressure `0..1` to a `0..1` dynamics factor. */
export type { PressureCurve }

export type PressureFallbackMode = 'fixed' | 'none' | 'velocity'

export interface SimpleBrushEngineOptions {
  /**
   * Dab spacing as a fraction of the dab **radius**.
   * `spacing = max(1, spacingRatio * radius)` (document px).
   * Smaller → denser, smoother strokes. Default `0.25`.
   */
  spacingRatio?: number
  /**
   * Minimum radius as a fraction of `baseSize / 2`, reached at pressure 0.
   * Default `0.2`.
   */
  minSizeRatio?: number
  /**
   * Maximum radius as a fraction of `baseSize / 2`, reached at pressure 1.
   * Default `1`.
   */
  maxSizeRatio?: number
  /** Single-dab opacity at pressure 0. Default `1`. */
  minOpacity?: number
  /** Single-dab opacity at pressure 1. Default `1`. */
  maxOpacity?: number
  /** Edge softness `0..1` passed through to every dab. Default `0` (hard). */
  hardness?: number
  /** Stamp-tip texture id. Default `round-hard`. */
  tipId?: string
  /** Per-stroke dab accumulation mode. Default `source-over`. */
  blendMode?: BrushDabBlendMode
  /** Dab rotation in radians, used by non-round tips. */
  rotation?: number
  /** Per-dab pigment deposit strength `0..1`. Default `1`. */
  density?: number
  /** Per-dab dilution / wetness `0..1`. Default `0`. */
  dilution?: number
  /** Wet-edge pigment buildup `0..1`. Default `0`. */
  wetEdge?: number
  /** Paper texture id used by later paper-grain coverage modulation. */
  paperTextureId?: string
  /** Paper texture modulation strength `0..1`. Default `0`. */
  paperTextureStrength?: number
  /** Legacy pressure remap used for both size and opacity when specific curves are omitted. */
  pressureCurve?: PressureCurveConfig
  /** Pressure remap for size. Default `linear`. */
  sizeCurve?: PressureCurveConfig
  /** Pressure remap for opacity. Default `linear`. */
  opacityCurve?: PressureCurveConfig
  /**
   * Mouse/no-pressure fallback.
   *
   * `velocity` maps slow strokes to full size and fast strokes thinner.
   * `fixed` uses `fallbackPressure`; `none` disables pressure dynamics.
   */
  pressureFallback?: PressureFallbackMode
  fallbackPressure?: number
  /** Velocity in document px/ms that starts reducing no-pressure size. */
  velocityPressureMin?: number
  /** Velocity in document px/ms that reaches minimum no-pressure size. */
  velocityPressureMax?: number
  /** Taper-in distance in document px. */
  taperIn?: number
  /** Taper-out enabled for the final endpoint dab when > 0. */
  taperOut?: number
  /** Minimum size multiplier at tapered endpoints. */
  taperMinFactor?: number
}

interface ResolvedSimpleBrushEngineOptions {
  spacingRatio: number
  minSizeRatio: number
  maxSizeRatio: number
  minOpacity: number
  maxOpacity: number
  hardness: number
  tipId: string
  blendMode: BrushDabBlendMode
  rotation: number
  density: number
  dilution: number
  wetEdge: number
  paperTextureId?: string
  paperTextureStrength: number
  sizeCurve: PressureCurve
  opacityCurve: PressureCurve
  pressureFallback: PressureFallbackMode
  fallbackPressure: number
  velocityPressureMin: number
  velocityPressureMax: number
  taperIn: number
  taperOut: number
  taperMinFactor: number
}

const DEFAULTS = {
  spacingRatio: 0.25,
  minSizeRatio: 0.2,
  maxSizeRatio: 1,
  minOpacity: 1,
  maxOpacity: 1,
  hardness: 0,
  tipId: 'round-hard',
  blendMode: 'source-over' as const,
  rotation: 0,
  density: 1,
  dilution: 0,
  wetEdge: 0,
  paperTextureStrength: 0,
  pressureFallback: 'velocity' as const,
  fallbackPressure: 1,
  velocityPressureMin: 0.05,
  velocityPressureMax: 2,
  taperIn: 0,
  taperOut: 0,
  taperMinFactor: 0.15,
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function withoutUndefined<T extends object>(options: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(options) as (keyof T)[]) {
    if (options[key] !== undefined)
      out[key] = options[key]
  }
  return out
}

/**
 * The P1 brush: round stamps placed at a fixed **spacing** along the input
 * path, with pressure driving size and opacity.
 *
 * Deliberately minimal — no stabilizer, no coalesced events, no taper (those
 * are P3), no textured tips or multiple brush types (P4). It is **deterministic**
 * (no `Math.random` / `Date.now`): the same input points always yield the same
 * dab sequence, which is the basis for replay and golden-image tests.
 *
 * All geometry is in **document space** (decision D2).
 */
export class SimpleBrushEngine implements BrushEngine {
  private readonly options: ResolvedSimpleBrushEngineOptions

  private ctx: BrushContext | null = null
  /** last input position consumed by `addPoint` */
  private lastPoint: BrushInputPoint | null = null
  /** pressure of the most recently placed dab (drives next spacing) */
  private lastPressure = 0
  /** distance travelled since the last placed dab, carried across calls */
  private residual = 0
  private strokeDistance = 0

  constructor(options: SimpleBrushEngineOptions = {}) {
    const pressureCurve = options.pressureCurve ?? 'linear'
    const definedOptions = withoutUndefined(options)
    this.options = {
      ...DEFAULTS,
      ...definedOptions,
      sizeCurve: createPressureCurve(options.sizeCurve ?? pressureCurve),
      opacityCurve: createPressureCurve(options.opacityCurve ?? pressureCurve),
    }
  }

  beginStroke(ctx: BrushContext): void {
    this.ctx = ctx
    this.lastPoint = null
    this.lastPressure = 0
    this.residual = 0
    this.strokeDistance = 0
  }

  addPoint(point: BrushInputPoint): BrushDab[] {
    if (!this.ctx)
      throw new Error('SimpleBrushEngine.addPoint called before beginStroke')

    const dabs: BrushDab[] = []

    // First point of the stroke: stamp it so the start endpoint is covered.
    if (!this.lastPoint) {
      const pressure = this.resolvePressure(point, null)
      const dab = this.makeDab(point.x, point.y, pressure, 0)
      dabs.push(dab)
      this.lastPoint = point
      this.lastPressure = pressure
      this.residual = 0
      return dabs
    }

    const ax = this.lastPoint.x
    const ay = this.lastPoint.y
    const ap = this.lastPressure
    const dx = point.x - ax
    const dy = point.y - ay
    const segLen = Math.hypot(dx, dy)
    const bp = this.resolvePressure(point, this.lastPoint)

    if (segLen === 0) {
      this.lastPoint = point
      this.lastPressure = bp
      return dabs
    }

    let traveled = 0
    const segmentStartDistance = this.strokeDistance
    // Spacing derives from the radius at the last placed dab's pressure; for a
    // constant-pressure stroke this is exact, so dab count == segLen / spacing.
    while (true) {
      const spacing = this.spacingFor(this.lastPressure)
      if (this.residual + (segLen - traveled) < spacing)
        break

      const advance = spacing - this.residual
      traveled += advance
      const t = traveled / segLen
      const px = lerp(ax, point.x, t)
      const py = lerp(ay, point.y, t)
      const pressure = lerp(ap, bp, t)
      const distance = segmentStartDistance + traveled

      dabs.push(this.makeDab(px, py, pressure, distance))
      this.lastPressure = pressure
      this.residual = 0
    }

    this.residual += segLen - traveled
    this.strokeDistance += segLen
    this.lastPoint = point
    this.lastPressure = bp
    return dabs
  }

  endStroke(): BrushDab[] {
    // Stamp the final position so the end endpoint is covered (no taper in P1).
    if (!this.lastPoint)
      return []
    const dab = this.makeDab(
      this.lastPoint.x,
      this.lastPoint.y,
      this.lastPressure,
      this.strokeDistance,
      this.options.taperOut > 0,
    )
    this.reset()
    return [dab]
  }

  private reset(): void {
    this.ctx = null
    this.lastPoint = null
    this.lastPressure = 0
    this.residual = 0
    this.strokeDistance = 0
  }

  private radiusFor(pressure: number, taperFactor = 1): number {
    const { minSizeRatio, maxSizeRatio, sizeCurve } = this.options
    const maxRadius = this.ctx!.baseSize / 2
    const f = sizeCurve(clamp01(pressure))
    return lerp(minSizeRatio * maxRadius, maxSizeRatio * maxRadius, f) * taperFactor
  }

  private spacingFor(pressure: number): number {
    return Math.max(1, this.options.spacingRatio * this.radiusFor(pressure))
  }

  private opacityFor(pressure: number): number {
    const { minOpacity, maxOpacity, opacityCurve } = this.options
    return lerp(minOpacity, maxOpacity, opacityCurve(clamp01(pressure)))
  }

  private makeDab(
    x: number,
    y: number,
    pressure: number,
    distance: number,
    forceTaperEnd = false,
  ): BrushDab {
    const taper = forceTaperEnd
      ? this.options.taperMinFactor
      : this.taperFactor(distance)
    return {
      x,
      y,
      radius: this.radiusFor(pressure, taper),
      opacity: this.opacityFor(pressure),
      color: { ...this.ctx!.color },
      hardness: this.options.hardness,
      rotation: this.options.rotation,
      tipId: this.options.tipId,
      density: clamp01(this.options.density),
      dilution: clamp01(this.options.dilution),
      wetEdge: clamp01(this.options.wetEdge),
      paperTextureId: this.options.paperTextureId,
      paperTextureStrength: clamp01(this.options.paperTextureStrength),
      blendMode: this.options.blendMode,
    }
  }

  private resolvePressure(point: BrushInputPoint, previous: BrushInputPoint | null): number {
    if (point.hasPressure !== false)
      return clamp01(point.pressure)

    switch (this.options.pressureFallback) {
      case 'fixed':
        return clamp01(this.options.fallbackPressure)
      case 'none':
        return 1
      case 'velocity':
      default:
        return this.resolveVelocityPressure(point, previous)
    }
  }

  private resolveVelocityPressure(point: BrushInputPoint, previous: BrushInputPoint | null): number {
    if (!previous)
      return 1

    const dt = Math.max(1, point.time - previous.time)
    const velocity = Math.hypot(point.x - previous.x, point.y - previous.y) / dt
    const { velocityPressureMin, velocityPressureMax } = this.options
    const span = Math.max(0.000001, velocityPressureMax - velocityPressureMin)
    const fastness = clamp01((velocity - velocityPressureMin) / span)
    return 1 - fastness
  }

  private taperFactor(distance: number): number {
    if (this.options.taperIn <= 0)
      return 1

    const t = clamp01(distance / this.options.taperIn)
    return lerp(this.options.taperMinFactor, 1, t)
  }
}
