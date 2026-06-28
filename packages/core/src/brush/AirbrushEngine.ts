import type { PressureCurve, PressureCurveConfig } from '../input'
import type {
  BrushContext,
  BrushDab,
  BrushEngine,
  BrushInputPoint,
} from '../types'
import { clamp01, createPressureCurve } from '../input'

export interface AirbrushEngineOptions {
  /** Dabs per second while the pointer dwells. */
  flowRate?: number
  /** Dab spacing as a fraction of radius while moving. */
  spacingRatio?: number
  minSizeRatio?: number
  maxSizeRatio?: number
  minOpacity?: number
  maxOpacity?: number
  hardness?: number
  tipId?: string
  pressureCurve?: PressureCurveConfig
  sizeCurve?: PressureCurveConfig
  opacityCurve?: PressureCurveConfig
  maxDabsPerTick?: number
}

interface ResolvedAirbrushEngineOptions {
  flowRate: number
  spacingRatio: number
  minSizeRatio: number
  maxSizeRatio: number
  minOpacity: number
  maxOpacity: number
  hardness: number
  tipId: string
  sizeCurve: PressureCurve
  opacityCurve: PressureCurve
  maxDabsPerTick: number
}

const DEFAULTS = {
  flowRate: 28,
  spacingRatio: 0.5,
  minSizeRatio: 0.65,
  maxSizeRatio: 1,
  minOpacity: 0.015,
  maxOpacity: 0.055,
  hardness: 0.9,
  tipId: 'airbrush-soft',
  maxDabsPerTick: 64,
}

/**
 * Time-driven soft brush. Movement emits spaced dabs; staying still emits more
 * dabs through {@link tick}, using caller-supplied timestamps for determinism.
 */
export class AirbrushEngine implements BrushEngine {
  private readonly options: ResolvedAirbrushEngineOptions

  private ctx: BrushContext | null = null
  private lastPoint: BrushInputPoint | null = null
  private lastPressure = 1
  private residual = 0
  private lastEmitTime = 0

  constructor(options: AirbrushEngineOptions = {}) {
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
    this.lastPressure = 1
    this.residual = 0
    this.lastEmitTime = 0
  }

  addPoint(point: BrushInputPoint): BrushDab[] {
    if (!this.ctx)
      throw new Error('AirbrushEngine.addPoint called before beginStroke')

    const dabs: BrushDab[] = []
    const pressure = this.resolvePressure(point)

    if (!this.lastPoint) {
      this.lastPoint = point
      this.lastPressure = pressure
      this.lastEmitTime = point.time
      dabs.push(this.makeDab(point.x, point.y, pressure))
      return dabs
    }

    const previous = this.lastPoint
    dabs.push(...this.emitTimedDabs(point.time))

    const dx = point.x - previous.x
    const dy = point.y - previous.y
    const distance = Math.hypot(dx, dy)
    if (distance > 0) {
      let traveled = 0
      while (true) {
        const spacing = this.spacingFor(this.lastPressure)
        if (this.residual + (distance - traveled) < spacing)
          break

        const advance = spacing - this.residual
        traveled += advance
        const t = traveled / distance
        const x = lerp(previous.x, point.x, t)
        const y = lerp(previous.y, point.y, t)
        const p = lerp(this.lastPressure, pressure, t)
        dabs.push(this.makeDab(x, y, p))
        this.lastPressure = p
        this.residual = 0
      }
      this.residual += distance - traveled
    }

    this.lastPoint = point
    this.lastPressure = pressure
    return dabs
  }

  tick(now: number): BrushDab[] {
    if (!this.ctx || !this.lastPoint)
      return []
    return this.emitTimedDabs(now)
  }

  endStroke(): BrushDab[] {
    this.reset()
    return []
  }

  private emitTimedDabs(now: number): BrushDab[] {
    const point = this.lastPoint
    if (!point)
      return []

    const interval = 1000 / Math.max(1, this.options.flowRate)
    const elapsed = Math.max(0, now - this.lastEmitTime)
    const count = Math.min(
      Math.floor(elapsed / interval),
      this.options.maxDabsPerTick,
    )
    if (count <= 0)
      return []

    this.lastEmitTime += count * interval
    return Array.from({ length: count }, () => this.makeDab(point.x, point.y, this.lastPressure))
  }

  private reset(): void {
    this.ctx = null
    this.lastPoint = null
    this.lastPressure = 1
    this.residual = 0
    this.lastEmitTime = 0
  }

  private radiusFor(pressure: number): number {
    const maxRadius = this.ctx!.baseSize / 2
    const factor = this.options.sizeCurve(clamp01(pressure))
    return lerp(this.options.minSizeRatio * maxRadius, this.options.maxSizeRatio * maxRadius, factor)
  }

  private opacityFor(pressure: number): number {
    const factor = this.options.opacityCurve(clamp01(pressure))
    return lerp(this.options.minOpacity, this.options.maxOpacity, factor)
  }

  private spacingFor(pressure: number): number {
    return Math.max(1, this.options.spacingRatio * this.radiusFor(pressure))
  }

  private resolvePressure(point: BrushInputPoint): number {
    if (point.hasPressure === false)
      return 1
    return clamp01(point.pressure)
  }

  private makeDab(x: number, y: number, pressure: number): BrushDab {
    return {
      x,
      y,
      radius: this.radiusFor(pressure),
      opacity: this.opacityFor(pressure),
      color: { ...this.ctx!.color },
      hardness: this.options.hardness,
      tipId: this.options.tipId,
    }
  }
}

export interface TickableBrushEngine extends BrushEngine {
  tick: (now: number) => BrushDab[]
}

export function isTickableBrushEngine(engine: BrushEngine): engine is TickableBrushEngine {
  return typeof (engine as Partial<TickableBrushEngine>).tick === 'function'
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
