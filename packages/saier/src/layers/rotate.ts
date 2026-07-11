import type * as PIXI from 'pixi.js'
import type { EditableLayer } from '.'

const ROTATION_SNAP_RADIANS = Math.PI / 12

/**
 * 获取夹角
 */
export function getAngleRadian(a: PIXI.Point, b: PIXI.Point) {
  const dot = a.dot(b)
  const det = a.cross(b)

  return Math.atan2(det, dot)
}

// import { getAngleRadian } from './utils'
export function createRotateHandle({
  layer,
  app,
  handleSprite,
}: {
  layer: EditableLayer
  app: PIXI.Application
  handleSprite: PIXI.Sprite
}) {
  let startPos: PIXI.Point | null = null
  let startRotation = 0
  const rotateSprite = handleSprite

  function onRotateStart(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()
    if (startPos)
      return

    layer.notifyTransformStart()
    rotateSprite.cursor = 'grabbing'
    startRotation = layer.rotation
    startPos = e.global.clone()
    app.stage.on('pointermove', onRotateMove)
    app.stage.on('pointerup', onRotateEnd)
    app.stage.on('pointerupoutside', onRotateEnd)
    app.stage.on('pointercancel', onRotateEnd)
  }

  function onRotateMove(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()

    if (!startPos)
      return

    const pos = e.global.clone()
    const center = layer.getGlobalPosition()

    const oa = startPos.subtract(center)
    const ob = pos.subtract(center)

    const angle = getAngleRadian(oa, ob)
    const rotation = startRotation + angle
    layer.rotation = e.shiftKey
      ? Math.round(rotation / ROTATION_SNAP_RADIANS) * ROTATION_SNAP_RADIANS
      : rotation
    layer.updateTransformBoundingBox()
    layer.notifyTransformChange()
  }

  function onRotateEnd() {
    if (!startPos)
      return

    startPos = null
    rotateSprite.cursor = 'grab'
    app.stage.off('pointermove', onRotateMove)
    app.stage.off('pointerup', onRotateEnd)
    app.stage.off('pointerupoutside', onRotateEnd)
    app.stage.off('pointercancel', onRotateEnd)
    layer.notifyTransformEnd()
  }

  rotateSprite.on('pointerdown', onRotateStart)
}
