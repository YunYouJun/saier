import type { BrushInputPoint } from '../types'

export interface StabilizerOptions {
  /** 0 = passthrough, 1 = moving average, 2 = exponential, 3+ = SAI-style lazy rope. */
  strength?: number
  movingAverageWindow?: number
  exponentialAlpha?: number
  /** Base lazy-rope radius in document px. Defaults to a strength-derived value. */
  ropeLength?: number
  /** Pointer speed in document px/ms where lazy-rope shortening starts. */
  velocityMin?: number
  /** Pointer speed in document px/ms where lazy-rope shortening reaches its maximum. */
  velocityMax?: number
  /** Fraction of `ropeLength` kept at `velocityMax`. Lower follows fast strokes more closely. */
  fastRopeRatio?: number
}

export class Stabilizer {
  readonly strength: number

  private readonly movingAverageWindow: number
  private readonly exponentialAlpha: number
  private readonly ropeLength: number
  private readonly velocityMin: number
  private readonly velocityMax: number
  private readonly fastRopeRatio: number
  private readonly buffer: BrushInputPoint[] = []
  private smoothed: BrushInputPoint | null = null
  private lastRaw: BrushInputPoint | null = null

  constructor(options: StabilizerOptions = {}) {
    this.strength = Math.max(0, finiteOr(options.strength, 0))
    this.movingAverageWindow = Math.max(1, finiteOr(options.movingAverageWindow, 4))
    this.exponentialAlpha = clamp(finiteOr(options.exponentialAlpha, 0.35), 0.05, 1)
    this.ropeLength = Math.max(0, finiteOr(options.ropeLength, defaultRopeLength(this.strength)))
    this.velocityMin = Math.max(0, finiteOr(options.velocityMin, 0.08))
    this.velocityMax = Math.max(this.velocityMin + 0.000001, finiteOr(options.velocityMax, 1.2))
    this.fastRopeRatio = clamp(finiteOr(options.fastRopeRatio, 0.45), 0.1, 1)
  }

  push(point: BrushInputPoint): BrushInputPoint[] {
    const raw = clonePoint(point)
    const previousRaw = this.lastRaw
    this.lastRaw = raw

    if (this.strength <= 0)
      return [raw]

    if (this.strength < 2)
      return [this.pushMovingAverage(raw)]

    if (this.strength < 3)
      return [this.pushExponential(raw)]

    return [this.pushLazyRope(raw, previousRaw)]
  }

  flush(): BrushInputPoint[] {
    if (!this.lastRaw || this.strength < 3)
      return []

    const current = this.smoothed
    if (!current || (current.x === this.lastRaw.x && current.y === this.lastRaw.y))
      return []

    this.smoothed = clonePoint(this.lastRaw)
    return [clonePoint(this.lastRaw)]
  }

  reset(): void {
    this.buffer.length = 0
    this.smoothed = null
    this.lastRaw = null
  }

  private pushMovingAverage(point: BrushInputPoint): BrushInputPoint {
    this.buffer.push(point)
    if (this.buffer.length > this.movingAverageWindow)
      this.buffer.shift()

    const avg = averagePoints(this.buffer)
    return {
      ...point,
      x: avg.x,
      y: avg.y,
    }
  }

  private pushExponential(point: BrushInputPoint): BrushInputPoint {
    this.buffer.push(point)
    if (this.buffer.length > this.movingAverageWindow)
      this.buffer.shift()
    const avg = averagePoints(this.buffer)
    const target = {
      ...point,
      x: avg.x,
      y: avg.y,
    }

    if (!this.smoothed) {
      this.smoothed = clonePoint(target)
      return clonePoint(target)
    }

    const alpha = Math.max(0.05, Math.min(1, this.exponentialAlpha))
    this.smoothed = {
      ...target,
      x: lerp(this.smoothed.x, target.x, alpha),
      y: lerp(this.smoothed.y, target.y, alpha),
    }
    return clonePoint(this.smoothed)
  }

  private pushLazyRope(point: BrushInputPoint, previousRaw: BrushInputPoint | null): BrushInputPoint {
    if (!this.smoothed) {
      this.smoothed = clonePoint(point)
      return clonePoint(point)
    }

    const ropeLength = this.effectiveRopeLength(point, previousRaw)
    const dx = point.x - this.smoothed.x
    const dy = point.y - this.smoothed.y
    const distance = Math.hypot(dx, dy)
    if (distance <= ropeLength) {
      this.smoothed = {
        ...point,
        x: this.smoothed.x,
        y: this.smoothed.y,
      }
      return clonePoint(this.smoothed)
    }

    const pull = (distance - ropeLength) / distance
    this.smoothed = {
      ...point,
      x: this.smoothed.x + dx * pull,
      y: this.smoothed.y + dy * pull,
    }
    return clonePoint(this.smoothed)
  }

  private effectiveRopeLength(point: BrushInputPoint, previousRaw: BrushInputPoint | null): number {
    if (!previousRaw || this.ropeLength <= 0)
      return this.ropeLength

    const dt = Math.max(1, point.time - previousRaw.time)
    const speed = Math.hypot(point.x - previousRaw.x, point.y - previousRaw.y) / dt
    const fastness = clamp01((speed - this.velocityMin) / (this.velocityMax - this.velocityMin))
    return this.ropeLength * lerp(1, this.fastRopeRatio, fastness)
  }
}

function averagePoints(points: BrushInputPoint[]): { x: number, y: number } {
  let x = 0
  let y = 0
  for (const point of points) {
    x += point.x
    y += point.y
  }
  return {
    x: x / points.length,
    y: y / points.length,
  }
}

function clonePoint(point: BrushInputPoint): BrushInputPoint {
  return { ...point }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function defaultRopeLength(strength: number): number {
  return strength < 3 ? 0 : 4 * strength
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}
