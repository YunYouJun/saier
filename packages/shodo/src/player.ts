import { Application, Container, Ticker } from 'pixi.js'
import { PLAYER_STATE, STROKE_OPERATION } from './const'
import { StrokeEngine } from './stroke-engine'
import { Tablet } from './tablet'
import { plain2Object } from './utils'

/**
 *
 * @example
 * var app = new Tiny.Application({...});
 * var player = new Tiny.calligraphy.Player(app.renderer, data);
 * var container = new Tiny.Container();
 *
 * container.addChild(player);
 * player.play();
 *
 * @example
 * // events
 * player.on('start', function() {
 *  console.time('play');
 * });
 * player.on('pause', function() {
 *  console.log('paused');
 * });
 * player.on('end', function() {
 *  console.timeEnd('play');
 * });
 *
 * @class
 * @extends Tiny.Container
 * @memberof Tiny.calligraphy
 */
class Player extends Container {
  /**
   *
   * @param {Tiny.CanvasRenderer|Tiny.WebGLRenderer} renderer
   * @param {string|object} strokeData
   */
  constructor(renderer, strokeData) {
    super(Tablet.maxStroke)

    if (!renderer) {
      throw new Error('The parameter Application~renderer is required')
    }

    this.renderer = renderer
    this.resolution = renderer.resolution

    this.speed = 2
    this.strokeEngine = new StrokeEngine(this)
    this.strokeData = strokeData
    this.currentStroke = []
    this.strokeHistoryWork = []
    this.state = PLAYER_STATE.STOPPED

    this.parseData()

    /**
     * Fired when begin play.
     *
     * @event Tiny.calligraphy.Player#start
     */

    /**
     * Fired when player paused.
     *
     * @event Tiny.calligraphy.Player#pause
     */

    /**
     * Fired when player stopped.
     *
     * @event Tiny.calligraphy.Player#stop
     */
  }

  parseData() {
    let strokeData = this.strokeData

    if (String.isString(strokeData)) {
      strokeData = plain2Object(strokeData)
    }

    const { width, height } = this.renderer
    const { dpi, pv, w, h, sh } = strokeData
    const radio = Math.min(width, height) / Math.min(w, h)

    this.strokeHistory = sh
    this.strokeHistoryWork = [...sh]
    this.strokeEngine.refreshBrush(dpi)
    this.strokeEngine.pressureVelocity = pv
    this.setScale(radio)
  }

  onTick() {
    if (this.state !== PLAYER_STATE.PLAYING) {
      return
    }
    if (this.currentStroke.length === 0) {
      if (this.strokeHistoryWork.length === 0) {
        this.stop()
        return
      }

      const { O, D } = this.strokeHistoryWork.shift()

      this.strokeEngine.endStroke()
      this.strokeEngine.beginStroke()

      switch (O) {
        case STROKE_OPERATION.STROKE:
          this.currentStroke = [...D]
          break
        case STROKE_OPERATION.SET_BRUSH:
          this.strokeEngine.selectBrush(D)
          break
        case STROKE_OPERATION.SET_INK:
          this.strokeEngine.setBrushInk(D)
          break
        case STROKE_OPERATION.SET_COLOR:
          this.strokeEngine.setBrushColor(D)
          break
      }
    }

    const pos = this.currentStroke.shift()

    if (pos) {
      this.strokeEngine.addStrokePosition({ x: pos.X, y: pos.Y, t: pos.T, p: pos.P })
      this.strokeEngine.draw()
    }
  }

  /**
   *
   * @param {number} speed - 速度值，正整数
   */
  setSpeed(speed) {
    if (speed <= 0) {
      return
    }
    this.speed = ~~speed
  }

  /**
   * @return {number}
   */
  getSpeed() {
    return this.speed
  }

  /**
   *
   */
  play() {
    if (this.state === PLAYER_STATE.STOPPED) {
      this.currentStroke = []
      this.removeChildren()

      if (this.strokeHistoryWork.length === 0) {
        this.parseData()
      }
    }
    this.state = PLAYER_STATE.PLAYING
    this.timer = new Ticker()
    this.timer.on('update', () => {
      for (let i = 0; i < (60 / Application.FPS) * this.speed; i++) {
        this.onTick()
      }
    })
    this.timer.start()
    this.emit('start')
  }

  /**
   *
   */
  pause() {
    this.state = PLAYER_STATE.PAUSING
    this.timer.start()
    this.emit('pause')
  }

  /**
   *
   */
  stop() {
    this.state = PLAYER_STATE.STOPPED
    this.timer.stop()
    this.timer.destroy()
    this.emit('end')
  }
}

export {
  Player,
}
