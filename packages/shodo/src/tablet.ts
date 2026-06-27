import { Container, Rectangle } from 'pixi.js'
import { BRUSH_INK, BRUSH_TYPE, STROKE_OPERATION, VERSION } from './const'
import { StrokeEngine } from './stroke-engine'
import { object2Plain } from './utils'

/**
 * The format is:
 * <pre>
 * {
 *  P: number // 压力值（暂不支持）
 *  T: number // 距离第一笔的耗时（累加）
 *  X: number // 坐标 x
 *  Y: number // 坐标 y
 * }
 * </pre>
 * @typedef {object} StrokeData
 * @property {number} P - 压力值（暂不支持）
 * @property {number} T - 距离第一笔的耗时（累加）
 * @property {number} X - 坐标 x
 * @property {number} Y - 坐标 y
 */

/**
 * The format is:
 * <pre>
 * {
 *   v: 版本号
 *   dpi: DPI
 *   pv: 压速
 *   w: 宽
 *   h: 高
 *   sh: [
 *     // 0: STROKE
 *     {
 *       O: STROKE_OPERATION // 值为 0
 *       D: StrokeData[]
 *     },
 *     // 1: SET_BRUSH
 *     {
 *       O: STROKE_OPERATION // 值为 1
 *       D: BRUSH_TYPE
 *     },
 *     // 2: SET_INK
 *     {
 *       O: STROKE_OPERATION // 值为 2
 *       D: BRUSH_INK
 *     },
 *     // 3: SET_COLOR
 *     {
 *       O: STROKE_OPERATION // 值为 3
 *       D: number // 如：0xffff00
 *     },
 *   ]
 * }
 * </pre>
 * @typedef {object[]} StrokeHistory
 */

/**
 *
 * @example
 * var app = new Tiny.Application({...});
 * var tablet = new Tiny.calligraphy.Tablet(app.renderer);
 * var container = new Tiny.Container();
 *
 * container.addChild(tablet);
 * tablet.start();
 *
 * @example
 * // events
 * tablet.on('stroke-begin', function() {
 *  console.log('stroke-begin');
 * });
 * tablet.on('stroke-end', function(history) {
 *  console.log(history);
 * });
 *
 * @class
 * @extends Tiny.Container
 * @memberof Tiny.calligraphy
 */
class Tablet extends Container {
  /**
   *
   * @param {Tiny.CanvasRenderer|Tiny.WebGLRenderer} renderer
   */
  constructor(renderer, options = {}) {
    super(Tablet.maxStroke)

    if (!renderer) {
      throw new Error('The parameter Application~renderer is required')
    }

    this.renderer = renderer
    this.resolution = renderer.resolution
    this.strokeEngine = new StrokeEngine(this)
    this.isInStroke = false
    this.strokeHistory = []
    this.strokePartition = []
    this.isPointerDown = false
    this.strokeBeginTime = null
    this.isLocked = false
    this.maxWidth = options.maxWidth
    this.maxHeight = options.maxHeight

    this.initAttribute()

    /**
     * Fired when begin stroke.
     *
     * @event Tiny.calligraphy.Tablet#stroke-begin
     */

    /**
     * Fired when end stroke.
     *
     * @event Tiny.calligraphy.Tablet#stroke-end
     * @property {StrokeHistory} strokeHistory - 笔画历史
     */
  }

  resetBrush() {
    this.initAttribute()
  }

  initAttribute() {
    this.selectBrush(BRUSH_TYPE.MEDIUM)
    this.setBrushInk(BRUSH_INK.MEDIUM)
    this.setPressureVelocity(2)
  }

  /**
   * 开始
   */
  start() {
    this.interactive = true
    this.hitArea = new Rectangle(0, 0, this.maxWidth, this.maxHeight)

    const downHandler = (e) => {
      this.data = e.data
      this.isPointerDown = true
      this.beginStroke()
    }
    const moveHandler = (e) => {
      e.stopPropagation()

      if (!this.data) {
        return
      }

      const newPos = this.data.getLocalPosition(this)
      const { x, y } = newPos
      if (x < 0 || x > this.maxWidth || y < 0 || y > this.maxHeight)
        return
      // const { pressure } = e.data;

      if (!this.isPointerDown) {
        return
      }

      if (this.children.length > Tablet.maxStroke) {
        return
      }

      this.isPointerDown = true
      this.addStrokePosition(x, y)
      this.emit('stroke-move', { x, y })
    }
    const upHandler = () => {
      if (!this.isPointerDown) {
        return
      }
      this.isPointerDown = false
      this.data = null
      this.endStroke()
    }

    this.on('pointerdown', downHandler)
    this.on('pointermove', moveHandler)
    this.on('pointerup', upHandler)
    this.on('pointerupoutside', upHandler)
  }

  beginStroke() {
    if (this.isLocked) {
      return
    }

    this.endStroke()

    this.isInStroke = true
    this.strokeBeginTime = new Date().valueOf()
    this.currentStroke = []
    this.strokePartition.push(this.children.length)
    this.strokeEngine.beginStroke()

    this.emit('stroke-begin')
  }

  addStrokePosition(x, y, pressure) {
    if (this.isLocked) {
      return
    }

    const t = new Date().valueOf() - this.strokeBeginTime
    const pos = {
      x,
      y,
      t,
      p: pressure,
    }

    this.currentStroke.push(pos)
    this.strokeEngine.addStrokePosition(pos)
    this.strokeEngine.draw()
  }

  endStroke() {
    if (this.isLocked) {
      return
    }

    if (!this.isInStroke) {
      return
    }

    this.strokeHistory.push({
      O: STROKE_OPERATION.STROKE,
      D: this.currentStroke.map((e) => {
        return { X: e.x, Y: e.y, T: e.t, P: e.p }
      }),
    })
    this.isInStroke = false
    this.currentStroke = null
    this.strokeEngine.endStroke()

    this.emit('stroke-end', this.strokeHistory)
  }

  /**
   * 获取绘制历史数据
   *
   * @return {StrokeHistory}
   */
  getHistory() {
    const dpi = this.resolution
    const pv = this.strokeEngine.pressureVelocity
    const { width: w, height: h } = this.renderer

    return {
      v: VERSION,
      dpi,
      pv,
      w,
      h,
      sh: this.strokeHistory,
    }
  }

  /**
   * 获取可存储/可用于回放的历史数据
   * <br>
   * 数据结构如下：
   * <pre>
   * // 0.1.0,2,4,828,932|1;1|2;medium|0;93.98,213.29,266,1;105.79,213.29,278,1;...
   * 版本号,DPI,压速,宽,高|STROKE_OPERATION;BRUSH_TYPE|STROKE_OPERATION;BRUSH_INK|STROKE_OPERATION;X,Y,T,P;X,Y,T,P;...
   * </pre>
   *
   * @return {string}
   */
  getPlainHistory() {
    return object2Plain(this.getHistory())
  }

  /**
   * 清空
   */
  clear() {
    if (this.isLocked) {
      return
    }

    this.endStroke()
    this.strokeHistory = []
    this.removeChildren()
    // clear 的时候不重置画笔
    // this.initAttribute();
  }

  /**
   * 撤销一次
   * <br>
   * 注意：如果期间有变更设置笔刷，撤销时也会算一次
   */
  undo() {
    if (this.isLocked) {
      return
    }

    this.endStroke()

    const historyLen = this.strokeHistory.length

    if (historyLen) {
      const { O } = this.strokeHistory.pop()

      if (O === STROKE_OPERATION.STROKE) {
        const pNum = this.strokePartition.pop()

        if (historyLen === 1) {
          this.removeChildren()
        }
        else {
          if (pNum < this.children.length) {
            this.removeChildren(pNum)
          }
        }
      }
    }
  }

  lock() {
    this.isLocked = true
  }

  unlock() {
    this.isLocked = false
  }

  /**
   * 获取当前笔刷类型
   *
   * @return {BRUSH_TYPE}
   */
  getCurrentBrush() {
    return this.strokeEngine.getCurrentBrush().type
  }

  /**
   * 选择笔刷类型
   *
   * @param {BRUSH_TYPE} type
   */
  selectBrush(type) {
    if (this.isLocked) {
      return
    }

    this.endStroke()
    this.strokeHistory.push({
      O: STROKE_OPERATION.SET_BRUSH,
      D: type,
    })
    this.strokeEngine.selectBrush(type)
  }

  /**
   * 获取当前笔刷墨量
   *
   * @return {BRUSH_INK}
   */
  getBrushInk() {
    return this.strokeEngine.getCurrentBrush().ink
  }

  /**
   * 设置笔刷墨量
   *
   * @param {BRUSH_INK} ink
   */
  setBrushInk(ink) {
    if (this.isLocked) {
      return
    }

    this.endStroke()
    this.strokeHistory.push({
      O: STROKE_OPERATION.SET_INK,
      D: ink,
    })
    this.strokeEngine.setBrushInk(ink)
  }

  /**
   * 获取当前笔刷色值
   *
   * @return {number}
   */
  getBrushColor() {
    return this.strokeEngine.getBrushColor()
  }

  /**
   * 设置笔刷颜色
   *
   * @param {number} color
   */
  setBrushColor(color) {
    if (this.isLocked) {
      return
    }

    this.endStroke()

    this.strokeHistory.push({
      O: STROKE_OPERATION.SET_COLOR,
      D: color,
    })

    this.strokeEngine.setBrushColor(color)
  }

  /**
   * 设置压速，值越大，越饱满
   *
   * @param {number} pv - 值建议：[1, 6]
   */
  setPressureVelocity(pv) {
    this.strokeEngine.pressureVelocity = pv * this.resolution
  }

  /**
   * 获取当前绘制的图片
   *
   * @example
   * tablet.getImage(); // 获取实际内容像素区间的图片
   * tablet.getImage('stage'); // 获取整个舞台的图片
   * tablet.getImage(null, #ff0000); // 获取实际内容像素区间，背景填充为红色的图片
   * tablet.getImage(new Tiny.Rectangle(10, 10, 200, 200)); // 获取固定 region 尺寸的图片
   *
   * @param {Tiny.Rectangle|string} [region] - 是否截取指定区域，当为 `stage` 时，为整个舞台，不传则为实际内容像素区间
   * @param {string} [fillColor] - 是否通过颜色填充透明区域。如：#ff0000、rgba(155, 155, 155, 0.6)
   * @param {string} [type] - 图片格式，默认为 image/png
   * @return {string} base64 格式图片
   */
  getImage(region, fillColor, type = 'image/png') {
    const { renderer, resolution } = this
    const canvas = document.createElement('canvas')
    const {
      x: $x,
      y: $y,
      width: $w,
      height: $h,
    } = region instanceof Rectangle ? region : this.getContentBounds()
    let x = $x * resolution
    let y = $y * resolution
    let width = $w * resolution
    let height = $h * resolution

    if (region === 'stage') {
      const { width: $w, height: $h } = renderer
      x = 0
      y = 0
      width = $w
      height = $h
    }

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (fillColor) {
      ctx.fillStyle = fillColor
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(renderer.view, x, y, width, height, 0, 0, width, height)

    return canvas.toDataURL(type)
  }

  /**
   * 获取真实绘制内容的 Bound
   * <br>
   * 注意：可能有误差
   *
   * @return {Tiny.Rectangle}
   */
  getContentBounds() {
    this.getLocalBounds()

    const { renderer, resolution } = this
    let { x, y, width, height } = this.getLocalBounds()
    let { width: w, height: h } = renderer

    w /= resolution
    h /= resolution

    if (width + x > w) {
      width = w - x
    }
    if (x < 0) {
      width = width - Math.abs(x)
      x = 0
    }
    if (height + y > h) {
      height = h - y
    }
    if (y < 0) {
      height = height - Math.abs(y)
      y = 0
    }

    return new Rectangle(x, y, width, height)
  }
}

/**
 * 可以绘制笔画点的数量，超过将不绘制（你可以根据诉求进行配置）
 *
 * @constant
 * @static
 * @memberof Tiny.calligraphy.Tablet
 * @name maxStroke
 * @type {number}
 * @default 20000
 */
Tablet.maxStroke = 2e4

export { Tablet }
