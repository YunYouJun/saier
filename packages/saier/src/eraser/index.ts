import type { BrushInputPoint } from '@saier/core'
import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import { isEmpty, SimpleBrushEngine, Stabilizer } from '@saier/core'
import { Point } from 'pixi.js'

export class PainterEraser {
  static index = 0
  /**
   * Enable eraser
   */
  static enabled = true
  static color: number = 0xFFFFFF

  /**
   * The radius of the brush.
   */
  static size = 10

  /**
   * Enable pressure support
   */
  static enablePressure = true
  static stabilizerStrength = 1

  static graphicsPool: PIXI.Graphics[] = []

  /**
   * prepare circle texture, that will be our brush
   */
  graphics: PIXI.Graphics | null = null

  dragging = false
  activePointerId: number | null = null
  lastDrawnPoint: PIXI.Point | null = null
  strokeLayerId: string | null = null
  engine = this.createEngine()
  stabilizer = this.createStabilizer()

  /**
   * mounted to container
   */
  parentContainer: PIXI.Container

  /**
   * setup brush events
   * @inner
   */
  setup(painter: Painter) {
    const { app } = painter
    app.stage
      .on('pointerdown', this.pointerDown.bind(this))
      .on('pointerup', this.pointerUp.bind(this))
      .on('pointerupoutside', this.pointerUp.bind(this))
      .on('pointermove', this.pointerMove.bind(this))
      .on('pointerout', this.pointerOut.bind(this))
      .on('pointerenter', this.pointerEnter.bind(this))
  }

  painter: Painter

  constructor(painter: Painter) {
    this.painter = painter
    this.setup(painter)
    this.parentContainer = painter.canvas.layersContainer
  }

  getPressure(event: PIXI.FederatedPointerEvent) {
    const { pressure } = event
    return PainterEraser.enablePressure && pressure > 0 ? pressure : 0
  }

  pointerDown(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return
    if (this.shouldIgnoreTouchGesture(event) || this.dragging)
      return

    const layerId = this.requireActiveLayerId()
    this.engine = this.createEngine()
    this.stabilizer = this.createStabilizer()
    this.engine.beginStroke({
      color: { r: 1, g: 1, b: 1, a: 1 },
      baseSize: PainterEraser.size,
    })
    this.painter.surface.beginStroke(layerId)
    this.strokeLayerId = layerId
    this.activePointerId = getPointerId(event)
    this.dragging = true
    this.pointerMove(event)
  }

  pointerMove(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    if (this.dragging && this.isActivePointer(event) && !this.shouldIgnoreTouchGesture(event))
      this.paintPoint(event)
  }

  pointerUp(_event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    const layerId = this.strokeLayerId
    if (!this.dragging || !layerId || !this.isActivePointer(_event))
      return

    this.dragging = false
    this.lastDrawnPoint = null
    this.strokeLayerId = null
    this.activePointerId = null

    for (const point of this.stabilizer.flush()) {
      for (const dab of this.engine.addPoint(point))
        this.painter.surface.paintDab(layerId, dab, 'erase')
    }
    for (const dab of this.engine.endStroke())
      this.painter.surface.paintDab(layerId, dab, 'erase')
    const patch = this.painter.surface.endStroke(layerId)
    this.painter.emitter.emit('eraser:up')
    this.painter.recordStrokePatch(patch)
  }

  pointerEnter(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    if (this.dragging) {
      const localPos = this.eventToCanvasLocal(event)
      this.lastDrawnPoint?.set(localPos.x, localPos.y)
    }

    this.painter.emitter.emit('eraser:enter')
  }

  pointerOut(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    if (this.lastDrawnPoint) {
      const localPos = this.eventToCanvasLocal(event)
      this.paintLocalPoint(
        localPos.x,
        localPos.y,
        this.getPressure(event),
        event.timeStamp,
        getPointerType(event),
      )

      this.lastDrawnPoint = null
    }

    this.painter.emitter.emit('eraser:out')
  }

  paintPoint(event: PIXI.FederatedPointerEvent) {
    const localPos = this.eventToCanvasLocal(event)
    this.paintLocalPoint(localPos.x, localPos.y, this.getPressure(event), event.timeStamp, getPointerType(event))
  }

  paintLocalPoint(x: number, y: number, pressure: number, time = 0, pointerType = 'pen') {
    const layerId = this.strokeLayerId
    if (!layerId)
      return

    const point = this.toDocumentPoint(x, y, pressure, time, pointerType)
    for (const sampled of this.stabilizer.push(point)) {
      for (const dab of this.engine.addPoint(sampled))
        this.painter.surface.paintDab(layerId, dab, 'erase')
    }

    this.lastDrawnPoint = this.lastDrawnPoint || new Point()
    this.lastDrawnPoint.set(x, y)
  }

  toDocumentPoint(
    x: number,
    y: number,
    pressure: number,
    time: number,
    pointerType = 'pen',
  ): BrushInputPoint {
    return {
      x: x + this.painter.surface.width / 2,
      y: y + this.painter.surface.height / 2,
      pressure,
      hasPressure: PainterEraser.enablePressure && pointerType !== 'mouse' && pressure > 0,
      pointerType,
      time,
    }
  }

  requireActiveLayerId(): string {
    const { activeLayerId } = this.painter.controller.getState()
    if (!activeLayerId)
      throw new Error('Cannot erase without an active layer')
    return activeLayerId
  }

  cancelStroke() {
    const layerId = this.strokeLayerId
    if (this.dragging && layerId) {
      const patch = this.painter.surface.endStroke(layerId)
      if (!isEmpty(patch.rect))
        this.painter.surface.applyPatch(patch, 'undo')
      this.painter.flushSurfaceUploads()
    }
    this.dragging = false
    this.activePointerId = null
    this.lastDrawnPoint = null
    this.strokeLayerId = null
    this.stabilizer.reset()
    this.engine = this.createEngine()
  }

  createEngine() {
    return new SimpleBrushEngine({
      pressureFallback: PainterEraser.enablePressure ? 'velocity' : 'none',
    })
  }

  createStabilizer() {
    return new Stabilizer({ strength: PainterEraser.stabilizerStrength })
  }

  setPressureEnabled(enabled: boolean) {
    PainterEraser.enablePressure = enabled
  }

  isActivePointer(event: PIXI.FederatedPointerEvent): boolean {
    return this.activePointerId === getPointerId(event)
  }

  shouldIgnoreTouchGesture(event: PIXI.FederatedPointerEvent): boolean {
    return getPointerType(event) === 'touch'
      && (this.painter.isTouchGestureActive() || this.painter.activeTouchCount() >= 2)
  }

  destroy() {
    this.graphics?.destroy()
    const { app } = this.painter
    app.stage.off('pointerdown', this.pointerDown.bind(this))
    app.stage.off('pointerup', this.pointerUp.bind(this))
    app.stage.off('pointerupoutside', this.pointerUp.bind(this))
    app.stage.off('pointermove', this.pointerMove.bind(this))
    app.stage.off('pointerout', this.pointerOut.bind(this))
  }

  private eventToCanvasLocal(event: PIXI.FederatedPointerEvent): PIXI.Point {
    return this.parentContainer.toLocal(event.global)
  }
}

export function createEraser(painter: Painter) {
  return new PainterEraser(painter)
}

function getPointerId(event: PIXI.FederatedPointerEvent): number {
  return event.pointerId ?? 1
}

function getPointerType(event: PIXI.FederatedPointerEvent): string {
  return event.pointerType ?? 'pen'
}
