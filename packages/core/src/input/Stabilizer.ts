import type { BrushInputPoint } from '../types'

export interface StabilizerOptions {
  /** 0 = passthrough, 1 = moving average, 2 = exponential, 3+ = lazy rope. */
  strength?: number
  movingAverageWindow?: number
  exponentialAlpha?: number
  ropeLength?: number
}

export class Stabilizer {
  readonly strength: number

  private readonly movingAverageWindow: number
  private readonly exponentialAlpha: number
  private readonly ropeLength: number
  private readonly buffer: BrushInputPoint[] = []
  private smoothed: BrushInputPoint | null = null
  private lastRaw: BrushInputPoint | null = null

  constructor(options: StabilizerOptions = {}) {
    this.strength = Math.max(0, options.strength ?? 0)
    this.movingAverageWindow = Math.max(1, options.movingAverageWindow ?? 4)
    this.exponentialAlpha = options.exponentialAlpha ?? 0.35
    this.ropeLength = Math.max(0, options.ropeLength ?? 6 * Math.max(1, this.strength))
  }

  push(point: BrushInputPoint): BrushInputPoint[] {
    const raw = clonePoint(point)
    this.lastRaw = raw

    if (this.strength <= 0)
      return [raw]

    if (this.strength < 2)
      return [this.pushMovingAverage(raw)]

    if (this.strength < 3)
      return [this.pushExponential(raw)]

    return [this.pushRope(raw)]
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

  private pushRope(point: BrushInputPoint): BrushInputPoint {
    if (!this.smoothed) {
      this.smoothed = clonePoint(point)
      return clonePoint(point)
    }

    const dx = point.x - this.smoothed.x
    const dy = point.y - this.smoothed.y
    const distance = Math.hypot(dx, dy)
    if (distance <= this.ropeLength) {
      this.smoothed = {
        ...point,
        x: this.smoothed.x,
        y: this.smoothed.y,
      }
      return clonePoint(this.smoothed)
    }

    const pull = (distance - this.ropeLength) / distance
    this.smoothed = {
      ...point,
      x: this.smoothed.x + dx * pull,
      y: this.smoothed.y + dy * pull,
    }
    return clonePoint(this.smoothed)
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
