import type {
  BrushDab,
  BrushEngine,
  BrushInputPoint,
  BrushPresetId,
  BrushPresetSummary,
  PainterBrushState,
  RGBA,
} from '@saier/core'
import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import {
  createBrushEngineFromPreset,
  DEFAULT_BRUSH_PRESET_ID,
  isEmpty,
  isTickableBrushEngine,
  Stabilizer,
} from '@saier/core'
import { Graphics, Point } from 'pixi.js'
import { PainterEraser } from '../eraser'
import { painterColorToRGBA } from '../utils/color'
import { toLayerLocalDab } from '../utils/transform'

export interface BrushOptions {
  renderTexture?: PIXI.RenderTexture
  /**
   * The radius of the brush.
   */
  radius?: number
}

export class PainterBrush {
  static index = 0

  /**
   * Enable brush
   */
  static enabled = true

  /**
   * The color of the brush.
   */
  static color: string | number = 0x000000
  /**
   * The radius of the brush.
   */
  static size = 10
  static presetId: BrushPresetId = DEFAULT_BRUSH_PRESET_ID

  /**
   * Enable pressure support
   */
  static enablePressure = true
  static stabilizerStrength = 1

  static graphicsPool: PIXI.Graphics[] = []

  /**
   * The circle shape of the brush.
   */
  circle = new Graphics()

  /**
   * prepare circle texture, that will be our brush
   */
  graphics: PIXI.Graphics | null = null

  dragging = false
  activePointerId: number | null = null
  lastDrawnPoint: PIXI.Point | null = null
  strokeLayerId: string | null = null
  engine!: BrushEngine
  stabilizer = this.createStabilizer()
  private animationFrameId: number | null = null
  private readonly handlePointerDown = (event: PIXI.FederatedPointerEvent) => this.pointerDown(event)
  private readonly handlePointerUp = (event: PIXI.FederatedPointerEvent) => this.pointerUp(event)
  private readonly handlePointerMove = (event: PIXI.FederatedPointerEvent) => this.pointerMove(event)
  private readonly handlePointerOut = (event: PIXI.FederatedPointerEvent) => this.pointerOut(event)
  private readonly handlePointerEnter = (event: PIXI.FederatedPointerEvent) => this.pointerEnter(event)

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
  private readonly handleBrushChange = (brush: PainterBrushState) => {
    PainterBrush.presetId = brush.presetId
    PainterBrush.size = brush.size
    PainterBrush.color = rgbaToHex(brush.color)
    PainterEraser.size = brush.size
    this.redrawCircle(brush.size)
  }

  /**
   * mounted to container
   */
  parentContainer: PIXI.Container

  constructor(painter: Painter) {
    this.painter = painter
    this.engine = this.createEngine()
    this.setup(painter)

    this.parentContainer = painter.canvas.layersContainer

    // brush shape
    this.circle.label = 'brush'
    this.redrawCircle(PainterBrush.size)
    this.circle.zIndex = 999
    painter.controller.on('brush:change', this.handleBrushChange)

    const stage = painter.app.stage
    stage.addEventListener('pointermove', (e) => {
      const localPos = stage.toLocal(e.global)
      this.circle.position.set(localPos.x, localPos.y)
    })
    stage.addChild(this.circle)
  }

  getPressure(event: PIXI.FederatedPointerEvent) {
    const { pressure } = event
    return PainterBrush.enablePressure && pressure > 0 ? pressure : 0
  }

  pointerDown(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return
    if (this.shouldIgnoreTouchGesture(event) || this.dragging)
      return

    const layerId = this.requireActiveLayerId()
    const { brush } = this.painter.controller.getState()
    this.engine = this.createEngine()
    this.stabilizer = this.createStabilizer()
    this.engine.beginStroke({ color: brush.color, baseSize: brush.size })
    this.painter.surface.beginStroke(layerId)
    this.strokeLayerId = layerId
    this.activePointerId = getPointerId(event)
    this.dragging = true
    this.pointerMove(event)
    this.startTicker()
  }

  beginDocumentStroke(point: BrushInputPoint, pointerId: number): boolean {
    if (!PainterBrush.enabled || this.dragging)
      return false

    const layerId = this.requireActiveLayerId()
    const { brush } = this.painter.controller.getState()
    this.engine = this.createEngine()
    this.stabilizer = this.createStabilizer()
    this.engine.beginStroke({ color: brush.color, baseSize: brush.size })
    this.painter.surface.beginStroke(layerId)
    this.strokeLayerId = layerId
    this.activePointerId = pointerId
    this.dragging = true
    this.paintDocumentPoint(point)
    this.startTicker()
    return true
  }

  pointerMove(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    if (this.dragging && this.isActivePointer(event) && !this.shouldIgnoreTouchGesture(event))
      this.paintPoint(event)
  }

  moveDocumentStroke(point: BrushInputPoint, pointerId: number): void {
    if (!PainterBrush.enabled || !this.dragging || this.activePointerId !== pointerId)
      return

    this.paintDocumentPoint(point)
  }

  pointerUp(_event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    const layerId = this.strokeLayerId
    if (!this.dragging || !layerId || !this.isActivePointer(_event))
      return

    this.finishStroke(layerId)
  }

  endDocumentStroke(pointerId: number, finalPoint?: BrushInputPoint): void {
    if (!PainterBrush.enabled)
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
    this.stopTicker()
    this.lastDrawnPoint = null
    this.strokeLayerId = null
    this.activePointerId = null

    for (const point of this.stabilizer.flush()) {
      this.paintDabs(layerId, this.engine.addPoint(point))
    }
    this.paintDabs(layerId, this.engine.endStroke())
    const patch = this.painter.surface.endStroke(layerId)
    this.painter.emitter.emit('brush:up')
    this.painter.recordStrokePatch(patch)
  }

  pointerEnter(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    if (this.dragging) {
      const localPos = this.eventToCanvasLocal(event)
      this.lastDrawnPoint?.set(localPos.x, localPos.y)
    }

    this.painter.emitter.emit('brush:enter')
  }

  pointerOut(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
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

    this.painter.emitter.emit('brush:out')
  }

  setSize(size: number) {
    this.painter.controller.brush.setSize(size)
  }

  setColor(color: number | string) {
    PainterBrush.color = color
    this.painter.controller.brush.setColor(painterColorToRGBA(color))
  }

  setOpacity(opacity: number) {
    this.painter.controller.brush.setOpacity(opacity)
  }

  setPreset(presetId: BrushPresetId) {
    this.painter.controller.brush.setPreset(presetId)
  }

  setSpacing(spacing: number) {
    this.painter.controller.brush.setSpacing(spacing)
  }

  setHardness(hardness: number) {
    this.painter.controller.brush.setHardness(hardness)
  }

  setFlow(flow: number) {
    this.painter.controller.brush.setFlow(flow)
  }

  setPressureEnabled(enabled: boolean) {
    PainterBrush.enablePressure = enabled
  }

  getPresets(): BrushPresetSummary[] {
    return this.painter.controller.getState().brush.presets
  }

  redrawCircle(size: number) {
    this.circle.clear()
    this.circle
      .circle(0, 0, size / 2)
      .stroke({ color: 0x000000, width: 1 })
  }

  sizeDown() {
    const size = Math.max(1, PainterBrush.size - 1)
    this.setSize(size)
  }

  sizeUp() {
    const size = PainterBrush.size + 1
    this.setSize(size)
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
      time,
      hasPressure: this.hasPressure(pressure, pointerType),
      pointerType,
    }
  }

  requireActiveLayerId(): string {
    const { activeLayerId } = this.painter.controller.getState()
    if (!activeLayerId)
      throw new Error('Cannot paint without an active layer')
    return activeLayerId
  }

  syncBrushState(color: RGBA) {
    this.painter.controller.brush.setColor(color)
    this.painter.controller.brush.setSize(PainterBrush.size)
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
    this.stopTicker()
    this.activePointerId = null
    this.lastDrawnPoint = null
    this.strokeLayerId = null
    this.stabilizer.reset()
    this.engine = this.createEngine()
  }

  createEngine(): BrushEngine {
    const { brush } = this.painter.controller.getState()
    const preset = this.painter.brushRegistry.require(brush.presetId)
    return createBrushEngineFromPreset(preset, {
      opacity: brush.opacity,
      spacing: brush.spacing,
      hardness: brush.hardness,
      flow: brush.flow,
      baseSize: brush.size,
      pressureFallback: PainterBrush.enablePressure ? preset.pressureFallback : 'none',
    })
  }

  createStabilizer() {
    return new Stabilizer({ strength: PainterBrush.stabilizerStrength })
  }

  isActivePointer(event: PIXI.FederatedPointerEvent): boolean {
    return this.activePointerId === getPointerId(event)
  }

  shouldIgnoreTouchGesture(event: PIXI.FederatedPointerEvent): boolean {
    return getPointerType(event) === 'touch'
      && (this.painter.isTouchGestureActive() || this.painter.activeTouchCount() >= 2)
  }

  hasPressure(pressure: number, pointerType: string): boolean {
    return PainterBrush.enablePressure && pointerType !== 'mouse' && pressure > 0
  }

  destroy() {
    this.stopTicker()
    this.graphics?.destroy()
    this.painter.controller.off('brush:change', this.handleBrushChange)
    const { app } = this.painter
    app.stage.off('pointerdown', this.handlePointerDown)
    app.stage.off('pointerup', this.handlePointerUp)
    app.stage.off('pointerupoutside', this.handlePointerUp)
    app.stage.off('pointermove', this.handlePointerMove)
    app.stage.off('pointerout', this.handlePointerOut)
    app.stage.off('pointerenter', this.handlePointerEnter)
  }

  private paintDabs(layerId: string, dabs: BrushDab[]): void {
    const transform = this.painter.document.getLayer(layerId)?.transform
    for (const dab of dabs)
      this.painter.surface.paintDab(layerId, toLayerLocalDab(dab, transform), 'normal')
  }

  private startTicker(): void {
    if (!isTickableBrushEngine(this.engine) || typeof requestAnimationFrame === 'undefined')
      return
    this.stopTicker()
    this.animationFrameId = requestAnimationFrame(this.handleAnimationFrame)
  }

  private stopTicker(): void {
    if (this.animationFrameId === null || typeof cancelAnimationFrame === 'undefined')
      return
    cancelAnimationFrame(this.animationFrameId)
    this.animationFrameId = null
  }

  private eventToCanvasLocal(event: PIXI.FederatedPointerEvent): PIXI.Point {
    return this.parentContainer.toLocal(event.global)
  }

  private normalizeDocumentPoint(point: BrushInputPoint): BrushInputPoint {
    const pressure = PainterBrush.enablePressure ? point.pressure : 0
    const pointerType = point.pointerType ?? 'pen'
    return {
      ...point,
      pressure,
      hasPressure: this.hasPressure(pressure, pointerType) && point.hasPressure !== false,
      pointerType,
    }
  }

  private readonly handleAnimationFrame = (now: number) => {
    this.animationFrameId = null

    const layerId = this.strokeLayerId
    if (this.dragging && layerId && isTickableBrushEngine(this.engine))
      this.paintDabs(layerId, this.engine.tick(now))

    if (this.dragging)
      this.startTicker()
  }
}

export function createBrush(painter: Painter) {
  return new PainterBrush(painter)
}

function getPointerId(event: PIXI.FederatedPointerEvent): number {
  return event.pointerId ?? 1
}

function getPointerType(event: PIXI.FederatedPointerEvent): string {
  return event.pointerType ?? 'pen'
}

function rgbaToHex(color: RGBA): string {
  const r = toHexByte(color.r)
  const g = toHexByte(color.g)
  const b = toHexByte(color.b)
  return `#${r}${g}${b}`
}

function toHexByte(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0')
}
