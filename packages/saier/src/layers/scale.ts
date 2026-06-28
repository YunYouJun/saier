import type * as PIXI from 'pixi.js'
import type { EditableLayer } from '.'
import { Point } from 'pixi.js'

export type ControlPointPosition
  = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_RIGHT' | 'BOTTOM_LEFT'
    | 'TOP_CENTER' | 'RIGHT_CENTER' | 'BOTTOM_CENTER' | 'LEFT_CENTER'
    | 'ROTATE'
    | 'CENTER' | 'REMOVE'

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
  key: ControlPointPosition
  container: PIXI.Container
}) {
  const handleSprite = sprite

  let startWidth = container.width
  let startHeight = container.height
  let aspectRatio = startWidth / startHeight

  const startDragPos: Point = new Point()

  let isDragging = false

  function onPointerDown(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()
    isDragging = true

    handleSprite.alpha = 1
    app.stage.on('pointermove', onScaleMove)

    startWidth = container.width
    startHeight = container.height
    aspectRatio = startWidth / startHeight

    startDragPos.copyFrom(e.global)
  }

  /**
   * OA'·OA / |OA| = OA' 在 OA 方向上的投影
   * OA = handleSpritePos
   * OA' = pos
   * @param e
   */
  function onScaleMove(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()

    if (!isDragging)
      return

    const pos = e.global

    const dx = (pos.x - startDragPos.x)
    const dy = (pos.y - startDragPos.y)

    const originalWidth = container.width / container.scale.x
    const originalHeight = container.height / container.scale.y

    // todo: fix scale when rotate
    if (key === 'TOP_CENTER' || key === 'BOTTOM_CENTER') {
      const newHeight = startHeight + dy * (key === 'TOP_CENTER' ? -1 : 1)
      const scale = newHeight / originalHeight
      if (scale)
        container.scale.y = newHeight / originalHeight
    }
    else if (key === 'LEFT_CENTER' || key === 'RIGHT_CENTER') {
      const newWidth = startWidth + dx * (key === 'LEFT_CENTER' ? -1 : 1)
      const scale = newWidth / originalWidth
      if (scale)
        container.scale.x = newWidth / originalWidth
    }
    else {
      const newWidth = startWidth + dx * (key === 'TOP_LEFT' || key === 'BOTTOM_LEFT' ? -1 : 1)
      const scale = newWidth / originalWidth

      if (scale) {
        container.scale.x = scale
        container.height = container.width / aspectRatio
      }
    }

    layer.updateTransformBoundingBox()
  }

  function onScaleEnd(e: PIXI.FederatedPointerEvent) {
    e.stopPropagation()
    isDragging = false

    handleSprite.alpha = 0.5
    app.stage.off('pointermove', onScaleMove)
  }
  handleSprite.on('pointerdown', onPointerDown)
  app.stage.on('pointerup', onScaleEnd)
  app.stage.on('pointerupoutside', onScaleEnd)

  return handleSprite
}
