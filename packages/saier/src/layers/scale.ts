import type * as PIXI from 'pixi.js'
import type { EditableLayer } from '.'
import { Point } from 'pixi.js'

export type ControlPointPosition
  = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_RIGHT' | 'BOTTOM_LEFT'
    | 'TOP_CENTER' | 'RIGHT_CENTER' | 'BOTTOM_CENTER' | 'LEFT_CENTER'
    | 'ROTATE'
    | 'CENTER'

export type ScaleControlPointPosition = Exclude<ControlPointPosition, 'ROTATE' | 'CENTER'>

interface ScaleAxes {
  x: -1 | 0 | 1
  y: -1 | 0 | 1
}

interface ScaleDragState {
  anchorLocal: Point
  anchorParent: Point
  axes: ScaleAxes
  bounds: { x: number, y: number, width: number, height: number }
  parent: PIXI.Container
  pivot: Point
  rotation: number
  startScaleX: number
  startScaleY: number
  signX: -1 | 1
  signY: -1 | 1
}

const MINIMUM_TRANSFORM_SIZE = 1

const SCALE_AXES: Record<ScaleControlPointPosition, ScaleAxes> = {
  TOP_LEFT: { x: -1, y: -1 },
  TOP_CENTER: { x: 0, y: -1 },
  TOP_RIGHT: { x: 1, y: -1 },
  RIGHT_CENTER: { x: 1, y: 0 },
  BOTTOM_RIGHT: { x: 1, y: 1 },
  BOTTOM_CENTER: { x: 0, y: 1 },
  BOTTOM_LEFT: { x: -1, y: 1 },
  LEFT_CENTER: { x: -1, y: 0 },
}

/**
 * add handle to scale
 */
export function createScaleHandle({
  layer,
  app,
  sprite,
  key,
  container,
}: {
  layer: EditableLayer
  app: PIXI.Application
  sprite: PIXI.Sprite
  key: ScaleControlPointPosition
  container: PIXI.Container
}) {
  const handleSprite = sprite
  let dragState: ScaleDragState | null = null

  function onPointerDown(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()
    if (dragState)
      return

    const parent = container.parent
    if (!parent)
      return

    const bounds = container.getLocalBounds()
    if (bounds.width <= 0 || bounds.height <= 0)
      return

    layer.notifyTransformStart()
    const axes = SCALE_AXES[key]
    const signX = container.scale.x < 0 ? -1 : 1
    const signY = container.scale.y < 0 ? -1 : 1
    const anchorLocal = new Point(
      oppositeCoordinate(bounds.x, bounds.width, signedAxis(axes.x, signX)),
      oppositeCoordinate(bounds.y, bounds.height, signedAxis(axes.y, signY)),
    )
    const anchorParent = parent.toLocal(container.toGlobal(anchorLocal))
    dragState = {
      anchorLocal,
      anchorParent,
      axes,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      parent,
      pivot: new Point(container.pivot.x, container.pivot.y),
      rotation: container.rotation,
      startScaleX: Math.max(Math.abs(container.scale.x), MINIMUM_TRANSFORM_SIZE / bounds.width),
      startScaleY: Math.max(Math.abs(container.scale.y), MINIMUM_TRANSFORM_SIZE / bounds.height),
      signX,
      signY,
    }

    app.stage.on('pointermove', onScaleMove)
    app.stage.on('pointerup', onScaleEnd)
    app.stage.on('pointerupoutside', onScaleEnd)
    app.stage.on('pointercancel', onScaleEnd)
  }

  function onScaleMove(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()

    if (!dragState)
      return

    const pointer = dragState.parent.toLocal(e.global)
    const dx = pointer.x - dragState.anchorParent.x
    const dy = pointer.y - dragState.anchorParent.y
    const cos = Math.cos(dragState.rotation)
    const sin = Math.sin(dragState.rotation)
    const localVector = new Point(
      cos * dx + sin * dy,
      -sin * dx + cos * dy,
    )
    const scale = resizedScale(dragState, localVector, layer.aspectRatioLocked !== e.shiftKey)

    container.scale.set(scale.x, scale.y)
    positionAtFixedAnchor(container, dragState, scale)

    layer.updateTransformBoundingBox()
    layer.notifyTransformChange()
  }

  function onScaleEnd(e: PIXI.FederatedPointerEvent) {
    if (!dragState)
      return

    e.stopPropagation()
    dragState = null
    app.stage.off('pointermove', onScaleMove)
    app.stage.off('pointerup', onScaleEnd)
    app.stage.off('pointerupoutside', onScaleEnd)
    app.stage.off('pointercancel', onScaleEnd)
    layer.notifyTransformEnd()
  }

  handleSprite.on('pointerdown', onPointerDown)

  return handleSprite
}

function signedAxis(axis: -1 | 0 | 1, sign: -1 | 1): -1 | 0 | 1 {
  return (axis * sign) as -1 | 0 | 1
}

function oppositeCoordinate(start: number, length: number, axis: -1 | 0 | 1): number {
  if (axis < 0)
    return start + length
  if (axis > 0)
    return start
  return start + length / 2
}

function resizedScale(state: ScaleDragState, pointer: Point, lockAspectRatio: boolean): Point {
  const { axes, bounds, startScaleX, startScaleY } = state
  if (axes.x !== 0 && axes.y !== 0 && lockAspectRatio) {
    const startX = axes.x * bounds.width * startScaleX
    const startY = axes.y * bounds.height * startScaleY
    const denominator = startX * startX + startY * startY
    const projectedFactor = denominator > 0
      ? (pointer.x * startX + pointer.y * startY) / denominator
      : 1
    const minimumFactor = Math.max(
      MINIMUM_TRANSFORM_SIZE / (bounds.width * startScaleX),
      MINIMUM_TRANSFORM_SIZE / (bounds.height * startScaleY),
    )
    const factor = Math.max(minimumFactor, projectedFactor)
    return new Point(state.signX * startScaleX * factor, state.signY * startScaleY * factor)
  }

  const scaleX = axes.x === 0
    ? startScaleX
    : Math.max(MINIMUM_TRANSFORM_SIZE / bounds.width, axes.x * pointer.x / bounds.width)
  const scaleY = axes.y === 0
    ? startScaleY
    : Math.max(MINIMUM_TRANSFORM_SIZE / bounds.height, axes.y * pointer.y / bounds.height)
  return new Point(state.signX * scaleX, state.signY * scaleY)
}

function positionAtFixedAnchor(
  container: PIXI.Container,
  state: ScaleDragState,
  scale: Point,
): void {
  const offsetX = (state.anchorLocal.x - state.pivot.x) * scale.x
  const offsetY = (state.anchorLocal.y - state.pivot.y) * scale.y
  const cos = Math.cos(state.rotation)
  const sin = Math.sin(state.rotation)
  container.position.set(
    state.anchorParent.x - (cos * offsetX - sin * offsetY),
    state.anchorParent.y - (sin * offsetX + cos * offsetY),
  )
}
