import type { BrushDab, BrushInputPoint } from '@saier/core'
import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import { isEmpty, SimpleBrushEngine, Stabilizer } from '@saier/core'
import { Point } from 'pixi.js'
import { toLayerLocalDab } from '../utils/transform'

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
  private readonly handlePointerDown = (event: PIXI.FederatedPointerEvent) => this.pointerDown(event)
  private readonly handlePointerUp = (event: PIXI.FederatedPointerEvent) => this.pointerUp(event)
  private readonly handlePointerMove = (event: PIXI.FederatedPointerEvent) => this.pointerMove(event)
  private readonly handlePointerOut = (event: PIXI.FederatedPointerEvent) => this.pointerOut(event)
  private readonly handlePointerEnter = (event: PIXI.FederatedPointerEvent) => this.pointerEnter(event)

  /**
   * mounted to container
   */
  parentContainer: PIXI.Container

  /**
   * setup brush events
   * @inner
   */
  setup(painter: Painter) {
    if (painter.inputPointerSource !== 'pixi')
      return

    const { app } = painter
    app.stage
      .on('pointerdown', this.handlePointerDown)
      .on('pointerup', this.handlePointerUp)
      .on('pointerupoutside', this.handlePointerUp)
      .on('pointermove', this.handlePointerMove)
      .on('pointerout', this.handlePointerOut)
      .on('pointerenter', this.handlePointerEnter)
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

  beginDocumentStroke(point: BrushInputPoint, pointerId: number): boolean {
    if (!PainterEraser.enabled || this.dragging)
      return false

    const layerId = this.requireActiveLayerId()
    this.engine = this.createEngine()
    this.stabilizer = this.createStabilizer()
    this.engine.beginStroke({
      color: { r: 1, g: 1, b: 1, a: 1 },
      baseSize: PainterEraser.size,
    })
    this.painter.surface.beginStroke(layerId)
    this.strokeLayerId = layerId
    this.activePointerId = pointerId
    this.dragging = true
    this.paintDocumentPoint(point)
    return true
  }

  pointerMove(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    if (this.dragging && this.isActivePointer(event) && !this.shouldIgnoreTouchGesture(event))
      this.paintPoint(event)
  }

  moveDocumentStroke(point: BrushInputPoint, pointerId: number): void {
    if (!PainterEraser.enabled || !this.dragging || this.activePointerId !== pointerId)
      return

    this.paintDocumentPoint(point)
  }

  pointerUp(_event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    const layerId = this.strokeLayerId
    if (!this.dragging || !layerId || !this.isActivePointer(_event))
      return

    this.finishStroke(layerId)
  }

  endDocumentStroke(pointerId: number, finalPoint?: BrushInputPoint): void {
    if (!PainterEraser.enabled)
      return

    const layerId = this.strokeLayerId
    if (!this.dragging || !layerId || this.activePointerId !== pointerId)
      return

    if (finalPoint)
      this.moveDocumentStroke(finalPoint, pointerId)

    this.finishStroke(layerId)
  }

  private finishStroke(layerId: string): void {
    this.dragging = false
    this.lastDrawnPoint = null
    this.strokeLayerId = null
    this.activePointerId = null

    for (const point of this.stabilizer.flush()) {
      this.paintDabs(layerId, this.engine.addPoint(point))
    }
    this.paintDabs(layerId, this.engine.endStroke())
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
    this.paintDocumentPoint(point)

    this.lastDrawnPoint = this.lastDrawnPoint || new Point()
    this.lastDrawnPoint.set(x, y)
  }

  paintDocumentPoint(point: BrushInputPoint): void {
    const layerId = this.strokeLayerId
    if (!layerId)
      return

    for (const sampled of this.stabilizer.push(this.normalizeDocumentPoint(point)))
      this.paintDabs(layerId, this.engine.addPoint(sampled))
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
    return this.painter.resolvePaintLayerId(activeLayerId)
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
    app.stage.off('pointerdown', this.handlePointerDown)
    app.stage.off('pointerup', this.handlePointerUp)
    app.stage.off('pointerupoutside', this.handlePointerUp)
    app.stage.off('pointermove', this.handlePointerMove)
    app.stage.off('pointerout', this.handlePointerOut)
    app.stage.off('pointerenter', this.handlePointerEnter)
  }

  private eventToCanvasLocal(event: PIXI.FederatedPointerEvent): PIXI.Point {
    return this.parentContainer.toLocal(event.global)
  }

  private paintDabs(layerId: string, dabs: BrushDab[]): void {
    const transform = this.painter.document.getLayer(layerId)?.transform
    for (const dab of dabs)
      this.painter.surface.paintDab(layerId, toLayerLocalDab(dab, transform), 'erase')
  }

  private normalizeDocumentPoint(point: BrushInputPoint): BrushInputPoint {
    const pressure = PainterEraser.enablePressure ? point.pressure : 0
    const pointerType = point.pointerType ?? 'pen'
    return {
      ...point,
      pressure,
      hasPressure: PainterEraser.enablePressure
        && pointerType !== 'mouse'
        && pressure > 0
        && point.hasPressure !== false,
      pointerType,
    }
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
