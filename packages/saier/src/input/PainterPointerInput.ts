import type { BrushInputPoint, PointerEventLike } from '@saier/core'
import type { Painter } from '../painter'
import { PointerSampler } from '@saier/core'
import { TouchGestureRouter } from '@saier/pixi'

export type PainterPointerSource = 'dom' | 'pixi'

export interface PainterInputOptions {
  pointerSource?: PainterPointerSource
  diagnostics?: boolean
}

export interface PainterInputSnapshot {
  source: PainterPointerSource
  eventType: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel'
  pointerId: number
  pointerType: string
  pressure: number
  hasPressure: boolean
  tiltX?: number
  tiltY?: number
  twist?: number
  coalescedCount: number
  sampleCount: number
  isDrawing: boolean
  time: number
}

interface DocumentStrokeTarget {
  beginDocumentStroke: (point: BrushInputPoint, pointerId: number) => boolean
  moveDocumentStroke: (point: BrushInputPoint, pointerId: number) => void
  endDocumentStroke: (pointerId: number, finalPoint?: BrushInputPoint) => void
  cancelStroke: () => void
}

interface SampledPointerEvent {
  points: BrushInputPoint[]
  coalescedCount: number
}

export class PainterPointerInput {
  private readonly painter: Painter
  private readonly canvas: HTMLCanvasElement
  private readonly diagnostics: boolean
  private readonly sampler: PointerSampler
  private readonly touchGestureRouter: TouchGestureRouter
  private activePointerId: number | null = null
  private activeStrokeTarget: DocumentStrokeTarget | null = null
  private currentRouterEvent: PointerEvent | null = null
  private previousTouchAction = ''
  private listening = false

  constructor(options: {
    painter: Painter
    diagnostics: boolean
  }) {
    this.painter = options.painter
    this.canvas = options.painter.app.canvas
    this.diagnostics = options.diagnostics
    this.sampler = new PointerSampler({
      viewport: {
        toDocument: point => this.toDocument(point.x, point.y),
      },
    })
    this.touchGestureRouter = new TouchGestureRouter({
      viewport: {
        panBy: (dx, dy) => this.painter.panViewportBy(dx, dy),
        zoomAt: (point, scaleFactor) => this.painter.zoomViewportAt(point, scaleFactor),
      },
      onStrokeStart: () => this.withCurrentEvent(event => this.beginStroke(event)),
      onStrokeMove: () => this.withCurrentEvent(event => this.moveStroke(event)),
      onStrokeEnd: () => this.withCurrentEvent(event => this.endStroke(event)),
      onStrokeCancel: () => this.withCurrentEvent(event => this.cancelStroke(event)),
    })
  }

  start(): void {
    if (this.listening)
      return

    this.previousTouchAction = this.canvas.style.touchAction
    this.canvas.style.touchAction = 'none'
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.listening = true
  }

  destroy(): void {
    if (!this.listening)
      return

    this.cancelActiveStroke()
    this.canvas.style.touchAction = this.previousTouchAction
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.listening = false
  }

  get activeTouchCount(): number {
    return this.touchGestureRouter.activeTouchCount
  }

  get isTouchGestureActive(): boolean {
    return this.touchGestureRouter.isGestureActive
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    this.capturePointer(event)
    this.routePointerEvent(event, 'pointerDown')
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    event.preventDefault()
    this.routePointerEvent(event, 'pointerMove')
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    event.preventDefault()
    this.routePointerEvent(event, 'pointerUp')
    this.releasePointer(event)
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    event.preventDefault()
    this.routePointerEvent(event, 'pointerCancel')
    this.releasePointer(event)
  }

  private routePointerEvent(
    event: PointerEvent,
    method: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  ): void {
    this.currentRouterEvent = event
    try {
      this.touchGestureRouter[method](this.toGestureEvent(event))
    }
    finally {
      this.currentRouterEvent = null
    }
  }

  private beginStroke(event: PointerEvent): void {
    const sampled = this.sample(event)
    const target = this.getStrokeTarget()
    if (!target || sampled.points.length === 0) {
      this.emitSnapshot(event, sampled, false)
      return
    }

    const [first, ...rest] = sampled.points
    const started = target.beginDocumentStroke(first!, event.pointerId)
    if (!started) {
      this.emitSnapshot(event, sampled, false)
      return
    }

    this.activePointerId = event.pointerId
    this.activeStrokeTarget = target
    for (const point of rest)
      target.moveDocumentStroke(point, event.pointerId)
    this.emitSnapshot(event, sampled, true)
  }

  private moveStroke(event: PointerEvent): void {
    const sampled = this.sample(event)
    const canDraw = this.activePointerId === event.pointerId && this.activeStrokeTarget !== null
    if (canDraw) {
      for (const point of sampled.points)
        this.activeStrokeTarget!.moveDocumentStroke(point, event.pointerId)
    }

    this.emitSnapshot(event, sampled, canDraw)
  }

  private endStroke(event: PointerEvent): void {
    const sampled = this.sample(event)
    const target = this.activePointerId === event.pointerId
      ? this.activeStrokeTarget
      : null

    if (target)
      target.endDocumentStroke(event.pointerId)
    this.activePointerId = null
    this.activeStrokeTarget = null
    this.emitSnapshot(event, sampled, false)
  }

  private cancelStroke(event: PointerEvent): void {
    const sampled = this.sample(event)
    this.cancelActiveStroke()
    this.emitSnapshot(event, sampled, false)
  }

  private cancelActiveStroke(): void {
    this.activeStrokeTarget?.cancelStroke()
    this.activePointerId = null
    this.activeStrokeTarget = null
  }

  private sample(event: PointerEvent): SampledPointerEvent {
    const coalesced = getCoalescedEvents(event)
    const eventLike = toPointerEventLike(event, coalesced)
    return {
      points: this.sampler.sample(eventLike),
      coalescedCount: coalesced.length,
    }
  }

  private emitSnapshot(
    event: PointerEvent,
    sampled: SampledPointerEvent,
    isDrawing: boolean,
  ): void {
    if (!this.diagnostics)
      return

    const point = sampled.points.at(-1)
    const pointerType = point?.pointerType ?? event.pointerType ?? 'mouse'
    const pressure = point?.pressure ?? clampPressure(event.pressure)
    const snapshot: PainterInputSnapshot = {
      source: 'dom',
      eventType: event.type as PainterInputSnapshot['eventType'],
      pointerId: event.pointerId,
      pointerType,
      pressure,
      hasPressure: point?.hasPressure ?? (pointerType !== 'mouse' && pressure > 0),
      tiltX: point?.tiltX ?? event.tiltX,
      tiltY: point?.tiltY ?? event.tiltY,
      twist: point?.twist ?? event.twist,
      coalescedCount: sampled.coalescedCount,
      sampleCount: sampled.points.length,
      isDrawing,
      time: point?.time ?? event.timeStamp,
    }
    this.painter.emitter.emit('input:pointer', snapshot)
  }

  private getStrokeTarget(): DocumentStrokeTarget | null {
    if (this.painter.tool === 'brush')
      return this.painter.brush
    if (this.painter.tool === 'eraser')
      return this.painter.eraser
    return null
  }

  private toDocument(clientX: number, clientY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const board = this.painter.board.container
    return {
      x: (clientX - rect.left - board.position.x) / board.scale.x + this.painter.surface.width / 2,
      y: (clientY - rect.top - board.position.y) / board.scale.y + this.painter.surface.height / 2,
    }
  }

  private toGestureEvent(event: PointerEvent): {
    pointerId: number
    pointerType: string
    clientX: number
    clientY: number
  } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      clientX: event.clientX - rect.left,
      clientY: event.clientY - rect.top,
    }
  }

  private withCurrentEvent(callback: (event: PointerEvent) => void): void {
    if (this.currentRouterEvent)
      callback(this.currentRouterEvent)
  }

  private capturePointer(event: PointerEvent): void {
    try {
      this.canvas.setPointerCapture?.(event.pointerId)
    }
    catch {
      // Synthetic browser tests may not register an active pointer capture.
    }
  }

  private releasePointer(event: PointerEvent): void {
    try {
      this.canvas.releasePointerCapture?.(event.pointerId)
    }
    catch {
      // Matching capture can be absent for synthetic or canceled events.
    }
  }
}

function getCoalescedEvents(event: PointerEvent): PointerEvent[] {
  if (event.type !== 'pointermove' || typeof event.getCoalescedEvents !== 'function')
    return []

  return event.getCoalescedEvents()
}

function toPointerEventLike(event: PointerEvent, coalesced: PointerEvent[]): PointerEventLike {
  return {
    type: event.type,
    clientX: event.clientX,
    clientY: event.clientY,
    pressure: event.pressure,
    pointerType: event.pointerType,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    timeStamp: event.timeStamp,
    getCoalescedEvents: coalesced.length > 0
      ? () => coalesced.map(item => toPointerEventLike(item, []))
      : undefined,
  }
}

function clampPressure(pressure: number): number {
  if (pressure < 0)
    return 0
  if (pressure > 1)
    return 1
  return pressure
}
