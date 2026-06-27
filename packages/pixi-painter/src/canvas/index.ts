import type { Painter } from '../painter'
import { Container, Graphics } from 'pixi.js'
import { PainterBoard } from '../board'

export class PainterCanvas {
  container = new Container()
  painter: Painter

  /**
   * for paint graphics
   */
  layersContainer = new Container()

  /**
   * The background of the canvas.
   */
  background: Graphics
  shape: Graphics

  minScale = 0.3

  constructor(painter: Painter) {
    this.painter = painter
    this.container.label = 'canvasContainer'
    this.layersContainer.label = 'layersContainer'

    const { options } = this.painter
    const {
      boardSize = {
        width: 512,
        height: 512,
      },
    } = options
    PainterBoard.size = boardSize

    const rect = [-boardSize.width / 2, -boardSize.height / 2, boardSize.width, boardSize.height] as const

    // mask shape (v8: describe path, then fill)
    const canvasShape = new Graphics()
    canvasShape.label = 'canvasShape'
    canvasShape.position.set(this.container.x, this.container.y)
    canvasShape.rect(...rect).fill(0xFFFFFF)

    this.painter.board.container.addChild(canvasShape)

    this.container.mask = canvasShape
    // init shape
    this.shape = canvasShape

    // board background (rebuilt rather than clone — v8 Graphics clone differs)
    const canvasBg = new Graphics()
    canvasBg.label = 'canvasBg'
    canvasBg.rect(...rect).fill(0xFFFFFF)
    canvasBg.zIndex = -1

    this.background = canvasBg

    // mount children
    this.container.addChild(canvasBg)
    // container children
    // add it after bg
    this.container.addChild(this.layersContainer)
    this.bindEvents()
  }

  bindEvents() {
    // event
    const boardContainer = this.painter.board.container

    // scale
    this.painter.app.stage.on('wheel', (e) => {
      e.preventDefault()
      e.stopPropagation()

      const scroll = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50)
      const scale = Math.max(boardContainer.scale.x * (1 + scroll / 500), this.minScale)

      const offset = e.getLocalPosition(boardContainer)

      boardContainer.position.set(
        e.global.x - offset.x * scale,
        e.global.y - offset.y * scale,
      )
      this.painter.boundingBoxes.position.set(
        boardContainer.position.x,
        boardContainer.position.y,
      )
      this.scaleTo(scale)
      // this.painter.brush.graphics.scale.set(scale)
    })
  }

  scaleTo(scale: number) {
    const boardContainer = this.painter.board.container
    boardContainer.scale.set(scale)
    this.painter.boundingBoxes.scale.set(scale)
    this.painter.brush.circle.scale.set(scale)
  }

  /**
   * scale up
   */
  scaleUp() {
    this.scaleTo(this.painter.board.container.scale.x * 1.1)
  }

  /**
   * scale down
   */
  scaleDown() {
    this.scaleTo(this.painter.board.container.scale.x * 0.9)
  }

  clearLayers() {
    this.layersContainer.removeChildren()
  }

  destroy() {
    this.painter.app.stage.off('wheel')
  }
}

export function createCanvas(painter: Painter) {
  return new PainterCanvas(painter)
}
