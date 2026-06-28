import type {
  BrushContext,
  BrushDab,
  BrushEngine,
  BrushInputPoint,
} from '../types'
import { clamp01 } from '../input'

export interface CalligraphyEngineOptions {
  /** Moving-average window. shodo used 4 points. */
  bufferSize?: number
  /** Dab spacing as a fraction of the current radius. */
  spacingRatio?: number
  minSizeRatio?: number
  maxSizeRatio?: number
  minOpacity?: number
  maxOpacity?: number
  /** Velocity in document px/ms that maps close to the minimum size. */
  pressureVelocity?: number
  /** Number of deterministic tail dabs for the final flick. */
  taperOutSteps?: number
  taperMinFactor?: number
  hardness?: number
  tipId?: string
}

interface BufferedPoint extends BrushInputPoint {
  resolvedPressure: number
}

const DEFAULTS = {
  bufferSize: 4,
  spacingRatio: 0.35,
  minSizeRatio: 0.15,
  maxSizeRatio: 1,
  minOpacity: 0.35,
  maxOpacity: 1,
  pressureVelocity: 1.2,
  taperOutSteps: 3,
  taperMinFactor: 0.08,
  hardness: 0.25,
  tipId: 'calligraphy-round',
}

/**
 * A deterministic brush engine distilled from `packages/shodo`.
 *
 * It keeps shodo's useful pieces (4-point moving average, velocity-to-width,
 * and a final flick) but emits normal `BrushDab`s into any `SurfaceBackend`.
 */
export class CalligraphyEngine implements BrushEngine {
  private readonly options: typeof DEFAULTS

  private ctx: BrushContext | null = null
  private readonly buffer: BrushInputPoint[] = []
  private lastPoint: BufferedPoint | null = null
  private lastRadius = 0
  private residual = 0
  private lastDirection = { x: 0, y: 0 }

  constructor(options: CalligraphyEngineOptions = {}) {
    this.options = { ...DEFAULTS, ...withoutUndefined(options) }
  }

  beginStroke(ctx: BrushContext): void {
    this.ctx = ctx
    this.buffer.length = 0
    this.lastPoint = null
    this.lastRadius = 0
    this.residual = 0
    this.lastDirection = { x: 0, y: 0 }
  }

  addPoint(point: BrushInputPoint): BrushDab[] {
    if (!this.ctx)
      throw new Error('CalligraphyEngine.addPoint called before beginStroke')

    this.buffer.push({ ...point })
    if (this.buffer.length > this.options.bufferSize)
      this.buffer.shift()

    const current = this.resolveBufferedPoint()
    if (!this.lastPoint) {
      const radius = this.radiusFor(current.resolvedPressure)
      this.lastPoint = current
      this.lastRadius = radius
      return [this.makeDab(current.x, current.y, radius, current.resolvedPressure)]
    }

    const previous = this.lastPoint
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y)
    if (distance === 0) {
      this.lastPoint = current
      return []
    }

    this.lastDirection = {
      x: (current.x - previous.x) / distance,
      y: (current.y - previous.y) / distance,
    }

    const radius = this.radiusFor(current.resolvedPressure)
    const dabs: BrushDab[] = []
    let traveled = 0

    while (true) {
      const spacing = Math.max(1, this.options.spacingRatio * Math.max(1, this.lastRadius))
      if (this.residual + (distance - traveled) < spacing)
        break

      const advance = spacing - this.residual
      traveled += advance
      const t = traveled / distance
      const x = lerp(previous.x, current.x, t)
      const y = lerp(previous.y, current.y, t)
      const dabRadius = lerp(this.lastRadius, radius, t)
      const pressure = lerp(previous.resolvedPressure, current.resolvedPressure, t)
      dabs.push(this.makeDab(x, y, dabRadius, pressure))
      this.lastRadius = dabRadius
      this.residual = 0
    }

    this.residual += distance - traveled
    this.lastPoint = current
    this.lastRadius = radius
    return dabs
  }

  endStroke(): BrushDab[] {
    if (!this.lastPoint)
      return []

    const dabs: BrushDab[] = []
    const steps = Math.max(1, this.options.taperOutSteps)
    const spacing = Math.max(1, this.options.spacingRatio * Math.max(1, this.lastRadius))

    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const radius = lerp(this.lastRadius, this.lastRadius * this.options.taperMinFactor, t)
      const opacity = lerp(this.options.maxOpacity, this.options.minOpacity, t)
      dabs.push({
        x: this.lastPoint.x + this.lastDirection.x * spacing * i,
        y: this.lastPoint.y + this.lastDirection.y * spacing * i,
        radius,
        opacity,
        color: { ...this.ctx!.color },
        hardness: this.options.hardness,
        tipId: this.options.tipId,
      })
    }

    this.reset()
    return dabs
  }

  private reset(): void {
    this.ctx = null
    this.buffer.length = 0
    this.lastPoint = null
    this.lastRadius = 0
    this.residual = 0
    this.lastDirection = { x: 0, y: 0 }
  }

  private resolveBufferedPoint(): BufferedPoint {
    let x = 0
    let y = 0
    let pressure = 0
    let time = 0

    for (const point of this.buffer) {
      x += point.x
      y += point.y
      pressure += this.resolvePressure(point)
      time += point.time
    }

    const n = this.buffer.length
    const latest = this.buffer[this.buffer.length - 1]!
    return {
      ...latest,
      x: x / n,
      y: y / n,
      pressure: latest.pressure,
      time: time / n,
      resolvedPressure: pressure / n,
    }
  }

  private resolvePressure(point: BrushInputPoint): number {
    if (point.hasPressure !== false)
      return clamp01(point.pressure)

    if (!this.lastPoint)
      return 1

    const dt = Math.max(1, point.time - this.lastPoint.time)
    const velocity = Math.hypot(point.x - this.lastPoint.x, point.y - this.lastPoint.y) / dt
    return 1 - clamp01(velocity / this.options.pressureVelocity)
  }

  private radiusFor(pressure: number): number {
    const maxRadius = this.ctx!.baseSize / 2
    return lerp(
      this.options.minSizeRatio * maxRadius,
      this.options.maxSizeRatio * maxRadius,
      clamp01(pressure),
    )
  }

  private makeDab(x: number, y: number, radius: number, pressure: number): BrushDab {
    return {
      x,
      y,
      radius,
      opacity: lerp(this.options.minOpacity, this.options.maxOpacity, clamp01(pressure)),
      color: { ...this.ctx!.color },
      hardness: this.options.hardness,
      tipId: this.options.tipId,
    }
  }
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
