import { Texture } from 'pixi.js'
import { brushs } from './brush'
import { BRUSH_INK, BRUSH_SIZE, BRUSH_TYPE } from './const'

class StrokeEngine {
  constructor(container) {
    this.container = container
    this.pressureVelocity = 1
    this.brushType = BRUSH_TYPE.MEDIUM
    this.brushInk = BRUSH_INK.MEDIUM
    this.brushColor = 0x000000
    this.bufferSize = 4
    this.strokeBuffer = []
    this.prevPosition = null
    this.prevBrushSize = null
    this.prevVelocity = 0
    this.prevDistance = 0
    this.expectedNextPosition = null
    this.accelerate = 0
  }

  async refreshBrush(scale) {
    const newBrush = await brushs.getBrush(this.brushType, this.brushInk)

    if (!scale) {
      scale = this.container.resolution
    }

    newBrush.maxSize *= scale
    newBrush.minSize *= scale

    this.currentBrush = newBrush
  }

  getCurrentBrush() {
    return this.currentBrush
  }

  selectBrush(type) {
    this.brushType = type
    this.refreshBrush()
  }

  setBrushInk(ink) {
    this.brushInk = ink
    this.refreshBrush()
  }

  // 蓝：597ab6
  // 绿：56bc53
  // 黄：b6b615
  // 橙：e3632c
  setBrushColor(color) {
    this.brushColor = color
    this.refreshBrush()
    this.currentBrush.image = Texture.from(this._createColoredBrush(color))
  }

  getBrushColor() {
    return this.brushColor
  }

  _createColoredBrush(color) {
    const { width, height } = BRUSH_SIZE
    const tmpCanvas = document.createElement('canvas')
    const ctx = tmpCanvas.getContext('2d')

    tmpCanvas.width = width
    tmpCanvas.height = height
    ctx.drawImage(this.currentBrush.image.baseTexture.source, 0, 0)

    const imageData = ctx.getImageData(0, 0, width, height)

    for (let i = 0, n = imageData.data.length / 4; i < n; i++) {
      imageData.data[(i * 4)] = (color & 0xFF0000) >> 16
      imageData.data[(i * 4) + 1] = (color & 0x00FF00) >> 8
      imageData.data[(i * 4) + 2] = (color & 0x0000FF)
    }

    ctx.putImageData(imageData, 0, 0)

    return tmpCanvas.toDataURL()
  }

  beginStroke() {
    this.strokeBuffer = []
    this.prevPosition = null
    this.prevBrushSize = null
    this.prevVelocity = 0
    this.prevDistance = 0
    this.expectedNextPosition = null
    this.accelerate = 0
  }

  endStroke() {
    const { accelerate } = this

    if (accelerate > 1) {
      const pos = {
        x: this.expectedNextPosition.x,
        y: this.expectedNextPosition.y,
        t: accelerate / (this.prevDistance * this.prevVelocity) + this.prevPosition.t,
        p: this.prevPosition.p * Math.min(accelerate / (this.prevDistance * this.prevVelocity), 1),
      }

      for (let i = 0, n = this.bufferSize; i < n; i++) {
        this.strokeBuffer.push(pos)
      }

      this.draw(true)
    }
  }

  draw() {
    const pos = this._getBufferedCurrentPosition()

    if (pos == null) {
      return
    }

    if (this.prevPosition === null) {
      this.prevPosition = pos
    }

    // stroke setup
    const t = pos.t - this.prevPosition.t
    const distance = this._getDistance(pos, this.prevPosition)
    const velocity = distance / Math.max(1, t)
    const accelerate = (this.prevVelocity === 0) ? 0 : velocity / this.prevVelocity
    const curve = (t, b, c, d) => (c * t / d + b)
    const brushSize = Math.max(
      this.currentBrush.minSize,
      curve(velocity, this.currentBrush.maxSize, -this.currentBrush.maxSize - this.currentBrush.minSize, this.pressureVelocity),
    )

    pos.s = brushSize

    // draw
    this._drawStroke(this.prevPosition, pos, brushSize, distance, velocity)

    this.accelerate = accelerate
    this.expectedNextPosition = this._getInterlatePos(this.prevPosition, pos, 1 + accelerate)
    this.prevPosition = pos
    this.prevBrushSize = brushSize
    this.prevVelocity = velocity
    this.prevDistance = distance
  }

  _drawStroke(startPos, endPos, brushSize, distance) {
    let t = 0
    const brushDelta = brushSize - this.prevBrushSize

    while (t < 1) {
      const brushSizeCur = Math.min(this.prevBrushSize + (brushDelta * t), this.currentBrush.maxSize)
      const pos = this._getInterlatePos(startPos, endPos, t)

      if (Math.random() > 0.2) {
        const jitter = ((Math.random() > 0.5) ? 1 : -1) * Number.parseInt(Math.random() * 1.2, 10)
        const px = pos.x - brushSizeCur / 2 + jitter
        const py = pos.y - brushSizeCur / 2 + jitter
        const dot = new Tiny.Sprite(this.currentBrush.image)
        dot.position.set(px, py)
        dot.width = brushSizeCur
        dot.height = brushSizeCur
        this.container.addChild(dot)
      }

      t += 1 / distance

      if (distance > 1e4 || distance < 1e-4)
        break
    }
  }

  addStrokePosition(pos) {
    this.strokeBuffer.push(pos)
  }

  _getBufferedCurrentPosition() {
    const pos = { x: 0, y: 0, t: 0, p: 0 }
    const bufferSize = Math.min(this.bufferSize, this.strokeBuffer.length)

    if (bufferSize === 0) {
      return null
    }

    for (let i = 1; i < bufferSize + 1; i++) {
      const p = this.strokeBuffer[this.strokeBuffer.length - i]

      pos.x += p.x
      pos.y += p.y
      pos.t += p.t
      pos.p += p.p
    }

    pos.x /= bufferSize
    pos.y /= bufferSize
    pos.t /= bufferSize
    pos.p /= bufferSize

    return pos
  }

  _getInterlatePos(p0, p1, moveLen) {
    const x = p0.x + (p1.x - p0.x) * moveLen
    const y = p0.y + (p1.y - p0.y) * moveLen

    return { x, y }
  }

  _getDistance(p0, p1) {
    const distance = ((p1.x - p0.x) * (p1.x - p0.x)) + ((p1.y - p0.y) * (p1.y - p0.y))

    return distance === 0 ? distance : Math.sqrt(distance)
  }
}

export {
  StrokeEngine,
}
