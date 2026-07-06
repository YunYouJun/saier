import type { Painter } from '../index'
import { Container } from 'pixi.js'
import { createBoardDrag } from './drag'

export class PainterBoard {
  static size = {
    width: 512,
    height: 512,
  }

  painter: Painter
  container = new Container()
  minScale = 0.3

  boardDrag: ReturnType<typeof createBoardDrag>

  /**
   * whether board can be dragged
   */
  dragMode = false

  constructor(painter: Painter) {
    this.painter = painter
    this.container.label = 'boardContainer'

    const { app } = this.painter
    this.container.x = app.canvas.width / app.renderer.resolution / 2
    this.container.y = app.canvas.height / app.renderer.resolution / 2

    // add drag
    this.boardDrag = createBoardDrag(this)
  }

  /**
   * reset board position to center
   */
  resetToCenter() {
    this.painter.resetViewport()
  }

  destroy() {
    this.boardDrag.destroy()
    this.container.destroy()
  }
}
