import type { BrushInputPoint } from '../types'
import { clamp01 } from './PressureCurve'

export interface ScreenPoint {
  x: number
  y: number
}

export interface PointerSamplerViewport {
  toDocument: (point: ScreenPoint) => ScreenPoint
}

export interface PointerEventLike {
  type?: string
  clientX: number
  clientY: number
  pressure?: number
  pointerType?: string
  tiltX?: number
  tiltY?: number
  twist?: number
  timeStamp: number
  getCoalescedEvents?: () => PointerEventLike[]
}

export interface PointerSamplerOptions {
  viewport: PointerSamplerViewport
  target?: EventTarget
  onPoints?: (points: BrushInputPoint[]) => void
}

/**
 * Converts DOM pointer events into document-space brush input points.
 *
 * The sampler intentionally preserves pressure provenance: mouse input is
 * marked `hasPressure=false` and missing pressure defaults to 0, not 0.5.
 */
export class PointerSampler {
  private readonly viewport: PointerSamplerViewport
  private readonly target?: EventTarget
  private readonly onPoints?: (points: BrushInputPoint[]) => void
  private listening = false

  constructor(options: PointerSamplerOptions) {
    this.viewport = options.viewport
    this.target = options.target
    this.onPoints = options.onPoints
  }

  start(): void {
    if (!this.target || this.listening)
      return
    this.target.addEventListener('pointerdown', this.handlePointerEvent as unknown as EventListener)
    this.target.addEventListener('pointermove', this.handlePointerEvent as unknown as EventListener)
    this.target.addEventListener('pointerup', this.handlePointerEvent as unknown as EventListener)
    this.target.addEventListener('pointercancel', this.handlePointerEvent as unknown as EventListener)
    this.listening = true
  }

  stop(): void {
    if (!this.target || !this.listening)
      return
    this.target.removeEventListener('pointerdown', this.handlePointerEvent as unknown as EventListener)
    this.target.removeEventListener('pointermove', this.handlePointerEvent as unknown as EventListener)
    this.target.removeEventListener('pointerup', this.handlePointerEvent as unknown as EventListener)
    this.target.removeEventListener('pointercancel', this.handlePointerEvent as unknown as EventListener)
    this.listening = false
  }

  sample(event: PointerEventLike): BrushInputPoint[] {
    const events = this.expand(event)
    return events.map(item => this.toPoint(item))
  }

  dispose(): void {
    this.stop()
  }

  private readonly handlePointerEvent = (event: PointerEventLike): void => {
    const points = this.sample(event)
    if (points.length > 0)
      this.onPoints?.(points)
  }

  private expand(event: PointerEventLike): PointerEventLike[] {
    if (event.type === 'pointermove' && event.getCoalescedEvents) {
      const coalesced = event.getCoalescedEvents()
      if (coalesced.length > 0)
        return coalesced
    }
    return [event]
  }

  private toPoint(event: PointerEventLike): BrushInputPoint {
    const doc = this.viewport.toDocument({ x: event.clientX, y: event.clientY })
    const pointerType = event.pointerType ?? 'mouse'
    const pressure = clamp01(event.pressure ?? 0)
    const hasPressure = pointerType !== 'mouse' && pressure > 0

    return {
      x: doc.x,
      y: doc.y,
      pressure,
      hasPressure,
      pointerType,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
      time: event.timeStamp,
    }
  }
}
