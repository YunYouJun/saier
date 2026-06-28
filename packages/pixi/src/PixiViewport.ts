import type { Container } from 'pixi.js'

export interface ViewportPoint {
  x: number
  y: number
}

export interface PixiViewportOptions {
  container: Container
  minScale?: number
  maxScale?: number
}

export class PixiViewport {
  readonly container: Container
  readonly minScale: number
  readonly maxScale: number

  constructor(options: PixiViewportOptions) {
    this.container = options.container
    this.minScale = options.minScale ?? 0.1
    this.maxScale = options.maxScale ?? 16
  }

  toDocument(point: ViewportPoint): ViewportPoint {
    return {
      x: (point.x - this.container.position.x) / this.container.scale.x,
      y: (point.y - this.container.position.y) / this.container.scale.y,
    }
  }

  panBy(dx: number, dy: number): void {
    this.container.position.set(
      this.container.position.x + dx,
      this.container.position.y + dy,
    )
  }

  zoomAt(point: ViewportPoint, scaleFactor: number): void {
    const before = this.toDocument(point)
    const nextScale = clamp(
      this.container.scale.x * scaleFactor,
      this.minScale,
      this.maxScale,
    )

    this.container.scale.set(nextScale)
    this.container.position.set(
      point.x - before.x * nextScale,
      point.y - before.y * nextScale,
    )
  }
}

function clamp(value: number, min: number, max: number): number {
  if (value < min)
    return min
  if (value > max)
    return max
  return value
}
