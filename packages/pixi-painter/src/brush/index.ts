import type * as PIXI from 'pixi.js'
import type { Painter } from '../painter'
import { Graphics, Point } from 'pixi.js'
import { PainterEraser } from '../eraser'
import { isAABBIntersect } from '../utils/intersect'

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

  /**
   * Enable pressure support
   */
  static enablePressure = true

  static graphicsPool: PIXI.Graphics[] = []

  /**
   * The circle shape of the brush.
   */
  circle = new Graphics().lineStyle(1, 0x000000)

  /**
   * prepare circle texture, that will be our brush
   */
  graphics: PIXI.Graphics | null = null

  dragging = false
  lastDrawnPoint: PIXI.Point | null = null

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

  /**
   * mounted to container
   */
  parentContainer: PIXI.Container

  constructor(painter: Painter) {
    this.painter = painter
    this.setup(painter)

    this.parentContainer = painter.canvas.layersContainer

    // brush shape
    this.circle.name = 'brush'
    this.circle.lineStyle(1, 0x000000)
      .drawCircle(0, 0, PainterBrush.size / 2)
    this.circle.zIndex = 999

    const stage = painter.app.stage
    stage.addEventListener('pointermove', (e) => {
      const { global: { x, y } } = e
      const localPos = e.getLocalPosition(stage, { x, y })
      this.circle.position.set(localPos.x, localPos.y)
    })
    stage.addChild(this.circle)
  }

  getPressure(event: PIXI.FederatedPointerEvent) {
    const { pressure } = event
    return PainterBrush.enablePressure ? pressure : 1
  }

  pointerDown(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    // new draw
    this.graphics = new Graphics().beginFill(PainterBrush.color)
    this.graphics.name = `brushGraphics ${PainterBrush.index++}`

    // add to container
    this.parentContainer.addChild(this.graphics)

    this.dragging = true
    this.pointerMove(event)
  }

  pointerMove(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    const { global: { x, y } } = event
    // local position relative to the canvas
    const localPos = event.getLocalPosition(this.parentContainer, { x, y })
    const graphics = this.graphics
    if (!graphics)
      return

    if (this.dragging) {
      graphics.beginFill(PainterBrush.color)
        .lineStyle(0, PainterBrush.color)
        .drawCircle(localPos.x, localPos.y, PainterBrush.size * this.getPressure(event))

      // app.renderer.render(brush, {
      //   // renderTexture,
      //   clear: false,
      //   skipUpdateTransform: false,
      // })

      // Smooth out the drawing a little bit to make it look nicer
      // this connects the previous drawn point to the current one
      // using a line
      if (this.lastDrawnPoint) {
        const lastDrawnPoint = this.lastDrawnPoint
        graphics
          // .clear()
          .lineStyle(PainterBrush.size * 2 * this.getPressure(event), PainterBrush.color)
          .moveTo(lastDrawnPoint.x, lastDrawnPoint.y)
          .lineTo(localPos.x, localPos.y)

        // line.endFill()
        // app.renderer.render(line, {
        //   // renderTexture,
        //   clear: false,
        //   skipUpdateTransform: false,
        // })
      }
      this.lastDrawnPoint = this.lastDrawnPoint || new Point()
      this.lastDrawnPoint.set(localPos.x, localPos.y)
    }
  }

  pointerUp(_event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    this.dragging = false
    this.lastDrawnPoint = null
    if (!this.graphics || !this.graphics.fill)
      return

    this.graphics?.endFill()

    this.painter.emitter.emit('brush:up')

    // history
    PainterBrush.graphicsPool.push(this.graphics)
    const graphics = this.graphics

    // judge graphics intersect with board
    const drawing = isAABBIntersect(this.painter.board.container, graphics)
    if (drawing) {
      this.painter.history.record({
        undo: () => {
          if (graphics) {
            graphics.visible = false
            // remove from pool
            PainterBrush.graphicsPool.pop()
          }
        },
        redo: () => {
          if (graphics) {
            graphics.visible = true
            // add to pool
            PainterBrush.graphicsPool.push(graphics)
          }
        },
      })
    }
    else {
      this.graphics.destroy()
    }
  }

  pointerEnter(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    const { global: { x, y } } = event
    if (this.dragging)
      this.lastDrawnPoint?.set(x, y)

    this.painter.emitter.emit('brush:enter')
  }

  pointerOut(event: PIXI.FederatedPointerEvent) {
    if (!PainterBrush.enabled)
      return

    const { global } = event
    if (this.lastDrawnPoint) {
      const localPos = event.getLocalPosition(this.parentContainer, global)
      this.graphics!
      // .clear()
        .lineStyle(PainterBrush.size * 2 * this.getPressure(event), PainterBrush.color)
        .moveTo(this.lastDrawnPoint.x, this.lastDrawnPoint.y)
        .lineTo(localPos.x, localPos.y)

      this.lastDrawnPoint = null
    }

    this.painter.emitter.emit('brush:out')
  }

  setSize(size: number) {
    this.circle.clear()
    this.circle.lineStyle(1, 0x000000)
    this.circle.drawCircle(0, 0, size / 2)
    PainterBrush.size = size
    PainterEraser.size = size
  }

  sizeDown() {
    const size = Math.max(1, PainterBrush.size - 1)
    this.setSize(size)
  }

  sizeUp() {
    const size = PainterBrush.size + 1
    PainterEraser.size = size
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

export function createBrush(painter: Painter) {
  return new PainterBrush(painter)
}
