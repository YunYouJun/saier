import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import { Graphics, Point } from 'pixi.js'

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

  static graphicsPool: PIXI.Graphics[] = []

  /**
   * prepare circle texture, that will be our brush
   */
  graphics: PIXI.Graphics | null = null

  dragging = false
  lastDrawnPoint: PIXI.Point | null = null

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
    return PainterEraser.enablePressure ? pressure : 1
  }

  pointerDown(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    this.dragging = true

    // this.painter.canvas.container.children.forEach((child) => {
    //   if (child.name?.includes('brushGraphics') || child instanceof EditableLayer) {
    //     // child.mask = this.graphics

    //     console.log(child)
    //   }
    // })

    // new draw
    this.graphics = new Graphics().beginFill(PainterEraser.color)
    PainterEraser.graphicsPool.push(this.graphics)
    this.graphics.name = `eraserGraphics ${PainterEraser.index++}`
    // this.painter.canvas.container.addChild(this.graphics)
    // TODO: Real eraser
    // this.graphics.blendMode = PIXI.BLEND_MODES.ERASE

    this.painter.canvas.layersContainer.addChild(this.graphics)

    this.pointerMove(event)
  }

  pointerMove(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    const { global: { x, y } } = event
    // local position relative to the canvas
    const localPos = event.getLocalPosition(this.parentContainer, { x, y })
    const graphics = this.graphics
    if (this.dragging && graphics) {
      graphics.beginFill(PainterEraser.color)
        .lineStyle(0, PainterEraser.color)
        .drawCircle(localPos.x, localPos.y, PainterEraser.size * this.getPressure(event))

      // Smooth out the drawing a little bit to make it look nicer
      // this connects the previous drawn point to the current one
      // using a line
      if (this.lastDrawnPoint) {
        const lastDrawnPoint = this.lastDrawnPoint
        graphics
          // .clear()
          .lineStyle(PainterEraser.size * 2 * this.getPressure(event), PainterEraser.color)
          .moveTo(lastDrawnPoint.x, lastDrawnPoint.y)
          .lineTo(localPos.x, localPos.y)
      }
      this.lastDrawnPoint = this.lastDrawnPoint || new Point()
      this.lastDrawnPoint.set(localPos.x, localPos.y)
    }
  }

  pointerUp(_event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    this.dragging = false
    this.lastDrawnPoint = null

    this.graphics?.endFill()

    this.painter.emitter.emit('eraser:up')

    // history
    const graphics = this.graphics
    this.painter.history.record({
      undo: () => {
        if (graphics) {
          graphics.visible = false
          // remove from pool
          PainterEraser.graphicsPool.pop()
        }
      },
      redo: () => {
        if (graphics) {
          graphics.visible = true
          // add to pool
          PainterEraser.graphicsPool.push(graphics)
        }
      },
    })
  }

  pointerEnter(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    const { global: { x, y } } = event
    if (this.dragging)
      this.lastDrawnPoint?.set(x, y)

    this.painter.emitter.emit('eraser:enter')
  }

  pointerOut(event: PIXI.FederatedPointerEvent) {
    if (!PainterEraser.enabled)
      return

    const { global } = event
    const graphics = this.graphics
    if (this.lastDrawnPoint && graphics) {
      const localPos = event.getLocalPosition(this.parentContainer, global)
      graphics
      // .clear()
        .lineStyle(PainterEraser.size * 2 * this.getPressure(event), PainterEraser.color)
        .moveTo(this.lastDrawnPoint.x, this.lastDrawnPoint.y)
        .lineTo(localPos.x, localPos.y)

      this.lastDrawnPoint = null
    }

    this.painter.emitter.emit('eraser:out')
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
}

export function createEraser(painter: Painter) {
  return new PainterEraser(painter)
}
