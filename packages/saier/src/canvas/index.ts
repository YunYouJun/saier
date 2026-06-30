import type { Painter } from '../painter'
import { Container, Graphics } from 'pixi.js'
import { PainterBoard } from '../board'

export class PainterCanvas {
  container = new Container()
  painter: Painter
  private readonly wheelListenerOptions = { passive: false } satisfies AddEventListenerOptions

  /**
   * for paint graphics
   */
  documentsContainer = new Container()
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
    this.documentsContainer.label = 'documentsContainer'
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
    this.container.addChild(this.documentsContainer)
    this.bindEvents()
  }

  resizeDocument(width: number, height: number) {
    PainterBoard.size = { width, height }
    const rect = [-width / 2, -height / 2, width, height] as const

    this.shape
      .clear()
      .rect(...rect)
      .fill(0xFFFFFF)

    this.background
      .clear()
      .rect(...rect)
      .fill(0xFFFFFF)
  }

  bindEvents() {
    this.painter.app.canvas.addEventListener('wheel', this.handleWheel, this.wheelListenerOptions)
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    event.stopPropagation()

    const rect = this.painter.app.canvas.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    const scaleFactor = Math.exp(-normalizeWheelDelta(event) / 500)
    this.painter.zoomViewportAt(point, scaleFactor)
  }

  scaleTo(scale: number) {
    const boardContainer = this.painter.board.container
    boardContainer.scale.set(scale)
    this.painter.boundingBoxes.scale.set(scale)
    this.painter.brush?.circle.scale.set(scale)
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
    this.painter.app.canvas.removeEventListener('wheel', this.handleWheel)
  }
}

function normalizeWheelDelta(event: WheelEvent): number {
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? window.innerHeight
      : 1

  return clamp(event.deltaY * unit, -100, 100)
}

function clamp(value: number, min: number, max: number): number {
  if (value < min)
    return min
  if (value > max)
    return max
  return value
}

export function createCanvas(painter: Painter) {
  return new PainterCanvas(painter)
}
