import type * as PIXI from 'pixi.js'
import type { EditableLayer } from '.'

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
    rotateSprite.alpha = 1

    startRotation = layer.rotation
    startPos = e.global.clone()
    app.stage.on('pointermove', onRotateMove)
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
    layer.rotation = startRotation + angle
    layer.boundingBoxContainer.rotation = layer.rotation
  }

  function onRotateEnd() {
    rotateSprite.alpha = 0.5
    app.stage.off('pointermove', onRotateMove)
  }

  rotateSprite.on('pointerdown', onRotateStart)
  app.stage.on('pointerup', onRotateEnd)
  app.stage.on('pointerupoutside', onRotateEnd)
}
