import type { ViewportPoint } from './PixiViewport'

export interface PointerGestureEventLike {
  pointerId: number
  pointerType?: string
  clientX: number
  clientY: number
}

export interface GestureViewport {
  panBy: (dx: number, dy: number) => void
  zoomAt: (point: ViewportPoint, scaleFactor: number) => void
}

export interface TouchGestureRouterOptions {
  viewport: GestureViewport
  onStrokeStart?: (event: PointerGestureEventLike) => void
  onStrokeMove?: (event: PointerGestureEventLike) => void
  onStrokeEnd?: (event: PointerGestureEventLike) => void
  onStrokeCancel?: () => void
}

interface TrackedTouch {
  id: number
  x: number
  y: number
}

/**
 * Routes touch input between drawing and two-finger viewport gestures.
 *
 * Pen/mouse input always goes to stroke callbacks. Touch starts as a stroke
 * with one active pointer, then cancels that stroke when a second touch appears.
 */
export class TouchGestureRouter {
  private readonly viewport: GestureViewport
  private readonly onStrokeStart?: (event: PointerGestureEventLike) => void
  private readonly onStrokeMove?: (event: PointerGestureEventLike) => void
  private readonly onStrokeEnd?: (event: PointerGestureEventLike) => void
  private readonly onStrokeCancel?: () => void
  private readonly touches = new Map<number, TrackedTouch>()
  private strokeTouchId: number | null = null
  private gestureActive = false
  private lastCentroid: ViewportPoint | null = null
  private lastDistance = 0

  constructor(options: TouchGestureRouterOptions) {
    this.viewport = options.viewport
    this.onStrokeStart = options.onStrokeStart
    this.onStrokeMove = options.onStrokeMove
    this.onStrokeEnd = options.onStrokeEnd
    this.onStrokeCancel = options.onStrokeCancel
  }

  pointerDown(event: PointerGestureEventLike): void {
    if (event.pointerType !== 'touch') {
      this.onStrokeStart?.(event)
      return
    }

    this.touches.set(event.pointerId, toTouch(event))
    if (this.touches.size === 1 && !this.gestureActive) {
      this.strokeTouchId = event.pointerId
      this.onStrokeStart?.(event)
      return
    }

    if (!this.gestureActive) {
      this.onStrokeCancel?.()
      this.gestureActive = true
    }
    this.strokeTouchId = null
    this.updateGestureBaseline()
  }

  pointerMove(event: PointerGestureEventLike): void {
    if (event.pointerType !== 'touch') {
      this.onStrokeMove?.(event)
      return
    }

    if (!this.touches.has(event.pointerId))
      return
    this.touches.set(event.pointerId, toTouch(event))

    if (this.gestureActive) {
      this.applyGesture()
      return
    }

    if (this.strokeTouchId === event.pointerId)
      this.onStrokeMove?.(event)
  }

  pointerUp(event: PointerGestureEventLike): void {
    if (event.pointerType !== 'touch') {
      this.onStrokeEnd?.(event)
      return
    }

    const wasStroke = this.strokeTouchId === event.pointerId && !this.gestureActive
    this.touches.delete(event.pointerId)
    if (wasStroke)
      this.onStrokeEnd?.(event)

    if (this.touches.size === 0)
      this.resetGesture()
    else if (this.gestureActive)
      this.updateGestureBaseline()
  }

  pointerCancel(event: PointerGestureEventLike): void {
    if (event.pointerType !== 'touch') {
      this.onStrokeCancel?.()
      return
    }

    if (this.strokeTouchId === event.pointerId)
      this.onStrokeCancel?.()
    this.touches.delete(event.pointerId)
    if (this.touches.size === 0)
      this.resetGesture()
  }

  get activeTouchCount(): number {
    return this.touches.size
  }

  get isGestureActive(): boolean {
    return this.gestureActive
  }

  private applyGesture(): void {
    const current = this.snapshotGesture()
    if (!current || !this.lastCentroid || this.lastDistance <= 0) {
      this.updateGestureBaseline()
      return
    }

    this.viewport.panBy(
      current.centroid.x - this.lastCentroid.x,
      current.centroid.y - this.lastCentroid.y,
    )
    this.viewport.zoomAt(current.centroid, current.distance / this.lastDistance)
    this.lastCentroid = current.centroid
    this.lastDistance = current.distance
  }

  private updateGestureBaseline(): void {
    const snapshot = this.snapshotGesture()
    this.lastCentroid = snapshot?.centroid ?? null
    this.lastDistance = snapshot?.distance ?? 0
  }

  private snapshotGesture(): { centroid: ViewportPoint, distance: number } | null {
    const touches = [...this.touches.values()]
    if (touches.length < 2)
      return null

    const a = touches[0]!
    const b = touches[1]!
    return {
      centroid: {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      },
      distance: Math.hypot(b.x - a.x, b.y - a.y),
    }
  }

  private resetGesture(): void {
    this.touches.clear()
    this.strokeTouchId = null
    this.gestureActive = false
    this.lastCentroid = null
    this.lastDistance = 0
  }
}

function toTouch(event: PointerGestureEventLike): TrackedTouch {
  return {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  }
}
