import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import type { ControlPointPosition, ScaleControlPointPosition } from './scale'
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { PainterBrush } from '../brush'
import { createDrag } from './drag'
import { createRotateHandle } from './rotate'
import { createScaleHandle } from './scale'

const TRANSFORM_COLOR = 0x3D5CAA
const TRANSFORM_CONTRAST_COLOR = 0xFFFFFF
const TRANSFORM_BORDER_SCREEN_WIDTH = 1.5
const TRANSFORM_CONTRAST_SCREEN_WIDTH = 3.5
const TRANSFORM_HANDLE_SCREEN_SIZE = 10
const TRANSFORM_MOUSE_HIT_SCREEN_SIZE = 32
const TRANSFORM_TOUCH_HIT_SCREEN_SIZE = 44
const TRANSFORM_HANDLE_RADIUS_SCREEN = 2
const TRANSFORM_ROTATE_OFFSET_SCREEN = 30
const TRANSFORM_EDGE_HANDLE_MIN_SPAN_SCREEN = 56
const HIT_TARGET_ALPHA = 0.001

const SCALE_CONTROL_POINTS: readonly ScaleControlPointPosition[] = [
  'TOP_LEFT',
  'TOP_CENTER',
  'TOP_RIGHT',
  'RIGHT_CENTER',
  'BOTTOM_RIGHT',
  'BOTTOM_CENTER',
  'BOTTOM_LEFT',
  'LEFT_CENTER',
]

const SCALE_CONTROL_POINT_ANGLES: Record<ScaleControlPointPosition, number> = {
  TOP_LEFT: -Math.PI * 3 / 4,
  TOP_CENTER: -Math.PI / 2,
  TOP_RIGHT: -Math.PI / 4,
  RIGHT_CENTER: 0,
  BOTTOM_RIGHT: Math.PI / 4,
  BOTTOM_CENTER: Math.PI / 2,
  BOTTOM_LEFT: Math.PI * 3 / 4,
  LEFT_CENTER: Math.PI,
}

const CONTROL_POINT_TITLES: Record<ControlPointPosition, string> = {
  TOP_LEFT: 'Resize from top left',
  TOP_CENTER: 'Resize from top',
  TOP_RIGHT: 'Resize from top right',
  RIGHT_CENTER: 'Resize from right',
  BOTTOM_RIGHT: 'Resize from bottom right',
  BOTTOM_CENTER: 'Resize from bottom',
  BOTTOM_LEFT: 'Resize from bottom left',
  LEFT_CENTER: 'Resize from left',
  ROTATE: 'Rotate layer',
  CENTER: 'Move layer',
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const

export interface EditableLayerOptions {
  layerId?: string
  bounds?: Rectangle
  onSelect?: (layer: EditableLayer) => void
  onTransformStart?: (layer: EditableLayer) => void
  onTransformChange?: (layer: EditableLayer) => void
  onTransformEnd?: (layer: EditableLayer) => void
  onTransformConfirm?: (layer: EditableLayer) => void
}

function isScaleControlPoint(key: ControlPointPosition): key is ScaleControlPointPosition {
  return SCALE_CONTROL_POINTS.includes(key as ScaleControlPointPosition)
}

function resizeCursor(key: ScaleControlPointPosition, rotation: number): typeof RESIZE_CURSORS[number] {
  const direction = Math.round((SCALE_CONTROL_POINT_ANGLES[key] + rotation) / (Math.PI / 4))
  const index = ((direction % RESIZE_CURSORS.length) + RESIZE_CURSORS.length) % RESIZE_CURSORS.length
  return RESIZE_CURSORS[index]!
}

function getCursor(key: ControlPointPosition, rotation = 0): string {
  if (isScaleControlPoint(key))
    return resizeCursor(key, rotation)
  if (key === 'ROTATE')
    return 'grab'
  return 'move'
}

/**
 * Interaction-only free-transform overlay.
 *
 * Image pixels live in a real raster layer. This container owns only hit
 * geometry and mirrors the layer's `LayerTransform` in document space.
 */
export class EditableLayer extends Container {
  static order = 0

  readonly painter: Painter
  readonly app: PIXI.Application
  readonly layerId?: string
  readonly boundingBoxContainer = new Container()
  readonly boundingBox = new Graphics()
  readonly controlPoints: Record<ControlPointPosition, Sprite> = {
    TOP_LEFT: new Sprite(Texture.WHITE),
    TOP_RIGHT: new Sprite(Texture.WHITE),
    BOTTOM_RIGHT: new Sprite(Texture.WHITE),
    BOTTOM_LEFT: new Sprite(Texture.WHITE),
    TOP_CENTER: new Sprite(Texture.WHITE),
    RIGHT_CENTER: new Sprite(Texture.WHITE),
    BOTTOM_CENTER: new Sprite(Texture.WHITE),
    LEFT_CENTER: new Sprite(Texture.WHITE),
    ROTATE: new Sprite(Texture.WHITE),
    CENTER: new Sprite(Texture.WHITE),
  }

  /** Visible handle size in screen pixels. */
  handleSize = TRANSFORM_HANDLE_SCREEN_SIZE
  /** Corners preserve aspect ratio by default; Shift temporarily inverts it. */
  aspectRatioLocked = true

  lastParent: Container | null = null
  lastBoundingBoxParent: Container | null = null

  private readonly options: EditableLayerOptions
  private readonly handleViewportChange = () => this.updateTransformBoundingBox()

  constructor(painter: Painter, options: EditableLayerOptions = {}) {
    super()
    this.painter = painter
    this.app = painter.app
    this.options = options
    this.layerId = options.layerId
    this.eventMode = 'static'
    this.cursor = 'move'
    this.label = options.layerId ? `transform:${options.layerId}` : 'transform'

    const bounds = options.bounds?.clone() ?? new Rectangle(-0.5, -0.5, 1, 1)
    this.boundsArea = bounds.clone()
    this.hitArea = bounds.clone()
    this.accessible = true
    this.accessibleType = 'button'
    this.accessibleTitle = 'Move selected layer'

    this.boundingBoxContainer.eventMode = 'static'
    this.boundingBoxContainer.label = `${this.label}:controls`
    this.boundingBox.eventMode = 'none'
    this.boundingBox.label = `${this.label}:outline`
    this.boundingBoxContainer.addChild(this.boundingBox)

    PainterBrush.enabled = false

    for (const [key, sprite] of Object.entries(this.controlPoints)) {
      const controlPoint = key as ControlPointPosition
      sprite.label = controlPoint
      sprite.anchor.set(0.5)
      sprite.cursor = getCursor(controlPoint)
      sprite.alpha = HIT_TARGET_ALPHA
      sprite.eventMode = 'static'
      sprite.hitArea = new Rectangle(-0.5, -0.5, 1, 1)
      sprite.accessible = true
      sprite.accessibleType = 'button'
      sprite.accessibleTitle = CONTROL_POINT_TITLES[controlPoint]
      this.boundingBoxContainer.addChild(sprite)

      if (controlPoint === 'ROTATE') {
        createRotateHandle({ layer: this, app: this.app, handleSprite: sprite })
      }
      else if (controlPoint === 'CENTER') {
        sprite.visible = false
        createDrag({
          handleSprite: sprite,
          painter,
          layer: this,
          app: this.app,
          containers: [this],
        })
      }
      else if (isScaleControlPoint(controlPoint)) {
        createScaleHandle({
          layer: this,
          app: this.app,
          sprite,
          container: this,
          key: controlPoint,
        })
      }
    }

    this.on('pointerdown', () => this.notifyTransformStart())
    this.on('dblclick', (event) => {
      event.stopPropagation()
      this.options.onTransformConfirm?.(this)
    })
    this.painter.emitter.on('viewport:change', this.handleViewportChange)
    this.painter.emitter.emit('layer:add', this)
    this.setSelected(false)
  }

  notifyTransformStart(): void {
    this.options.onSelect?.(this)
    this.options.onTransformStart?.(this)
  }

  notifyTransformChange(): void {
    this.options.onTransformChange?.(this)
  }

  notifyTransformEnd(): void {
    this.options.onTransformEnd?.(this)
  }

  setSelected(selected: boolean): void {
    this.visible = selected
    this.boundingBoxContainer.visible = selected
    if (selected)
      this.updateTransformBoundingBox()
  }

  updateTransformBoundingBox(): Container {
    this.boundingBoxContainer.position.copyFrom(this.position)
    this.boundingBoxContainer.rotation = this.rotation

    const localBounds = this.getLocalBounds()
    const left = Math.min(localBounds.x * this.scale.x, (localBounds.x + localBounds.width) * this.scale.x)
    const right = Math.max(localBounds.x * this.scale.x, (localBounds.x + localBounds.width) * this.scale.x)
    const top = Math.min(localBounds.y * this.scale.y, (localBounds.y + localBounds.height) * this.scale.y)
    const bottom = Math.max(localBounds.y * this.scale.y, (localBounds.y + localBounds.height) * this.scale.y)
    const bounds = { x: left, y: top, width: right - left, height: bottom - top }

    const viewportScale = Math.max(Math.abs(this.painter.board.container.scale.x), 0.001)
    const localScreenPixel = 1 / viewportScale
    const borderWidth = TRANSFORM_BORDER_SCREEN_WIDTH * localScreenPixel
    const contrastWidth = TRANSFORM_CONTRAST_SCREEN_WIDTH * localScreenPixel
    const handleSize = this.handleSize * localScreenPixel
    const handleHitSize = transformHitScreenSize() * localScreenPixel
    const handleRadius = TRANSFORM_HANDLE_RADIUS_SCREEN * localScreenPixel
    const rotateOffset = TRANSFORM_ROTATE_OFFSET_SCREEN * localScreenPixel
    const screenWidth = bounds.width * viewportScale
    const screenHeight = bounds.height * viewportScale
    const showHorizontalEdgeHandles = screenWidth >= TRANSFORM_EDGE_HANDLE_MIN_SPAN_SCREEN
    const showVerticalEdgeHandles = screenHeight >= TRANSFORM_EDGE_HANDLE_MIN_SPAN_SCREEN

    this.boundingBox.clear()
    this.boundingBox
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ width: contrastWidth, color: TRANSFORM_CONTRAST_COLOR, alpha: 0.9 })
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ width: borderWidth, color: TRANSFORM_COLOR, alpha: 1 })

    const positions = {
      TOP_LEFT: [bounds.x, bounds.y],
      TOP_RIGHT: [bounds.x + bounds.width, bounds.y],
      BOTTOM_RIGHT: [bounds.x + bounds.width, bounds.y + bounds.height],
      BOTTOM_LEFT: [bounds.x, bounds.y + bounds.height],
      TOP_CENTER: [bounds.x + bounds.width / 2, bounds.y],
      RIGHT_CENTER: [bounds.x + bounds.width, bounds.y + bounds.height / 2],
      BOTTOM_CENTER: [bounds.x + bounds.width / 2, bounds.y + bounds.height],
      LEFT_CENTER: [bounds.x, bounds.y + bounds.height / 2],
      ROTATE: [bounds.x + bounds.width / 2, bounds.y - rotateOffset],
      CENTER: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
    } as const

    const [topCenterX, topCenterY] = positions.TOP_CENTER
    const [rotateX, rotateY] = positions.ROTATE
    this.boundingBox
      .moveTo(topCenterX, topCenterY)
      .lineTo(rotateX, rotateY)
      .stroke({ width: contrastWidth, color: TRANSFORM_CONTRAST_COLOR, alpha: 0.9 })
      .moveTo(topCenterX, topCenterY)
      .lineTo(rotateX, rotateY)
      .stroke({ width: borderWidth, color: TRANSFORM_COLOR, alpha: 1 })

    this.controlPoints.TOP_CENTER.visible = showHorizontalEdgeHandles
    this.controlPoints.BOTTOM_CENTER.visible = showHorizontalEdgeHandles
    this.controlPoints.LEFT_CENTER.visible = showVerticalEdgeHandles
    this.controlPoints.RIGHT_CENTER.visible = showVerticalEdgeHandles
    this.controlPoints.CENTER.visible = false

    for (const key of SCALE_CONTROL_POINTS) {
      const sprite = this.controlPoints[key]
      const [x, y] = positions[key]
      sprite.position.set(x, y)
      sprite.width = handleHitSize
      sprite.height = handleHitSize
      sprite.cursor = resizeCursor(key, this.rotation)

      if (sprite.visible) {
        this.boundingBox
          .roundRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize, handleRadius)
          .fill({ color: TRANSFORM_CONTRAST_COLOR, alpha: 1 })
          .stroke({ width: borderWidth, color: TRANSFORM_COLOR, alpha: 1 })
      }
    }

    const rotateHandle = this.controlPoints.ROTATE
    rotateHandle.position.set(rotateX, rotateY)
    rotateHandle.width = handleHitSize
    rotateHandle.height = handleHitSize
    this.boundingBox
      .circle(rotateX, rotateY, handleSize / 2)
      .fill({ color: TRANSFORM_CONTRAST_COLOR, alpha: 1 })
      .stroke({ width: borderWidth, color: TRANSFORM_COLOR, alpha: 1 })

    this.controlPoints.CENTER.position.set(...positions.CENTER)
    return this.boundingBoxContainer
  }

  /** Detach the interaction overlay without destroying its retained undo data. */
  remove(): void {
    this.lastParent = this.parent
    this.lastBoundingBoxParent = this.boundingBoxContainer.parent
    this.parent?.removeChild(this)
    this.boundingBoxContainer.parent?.removeChild(this.boundingBoxContainer)
  }

  restore(): void {
    if (this.lastParent && !this.parent)
      this.lastParent.addChild(this)
    if (this.lastBoundingBoxParent && !this.boundingBoxContainer.parent)
      this.lastBoundingBoxParent.addChild(this.boundingBoxContainer)
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.painter.emitter.off('viewport:change', this.handleViewportChange)
    this.boundingBoxContainer.destroy({ children: true })
    super.destroy(options)
  }
}

function transformHitScreenSize(): number {
  if (typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches)
    return TRANSFORM_TOUCH_HIT_SCREEN_SIZE
  return TRANSFORM_MOUSE_HIT_SCREEN_SIZE
}
