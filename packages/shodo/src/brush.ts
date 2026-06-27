import { Assets } from 'pixi.js'
import { BRUSH_INK, BRUSH_INK_IMAGE, BRUSH_TYPE } from './const'

/**
 * @class
 * @memberof Tiny.calligraphy
 */
class Brush {
  /**
   *
   * @param {string} name - 笔刷类型名，方便辨识，无实际作用
   * @param {object} opts
   * @param {BRUSH_TYPE} opts.type  - 类型
   * @param {number} opts.maxSize - 最大尺寸
   * @param {number} opts.minSize - 最小尺寸
   * @param {BRUSH_INK} [opts.ink]
   * @param {Tiny.Texture} opts.image - 笔刷纹理
   */
  constructor(name, opts) {
    const { type, maxSize, minSize, ink = BRUSH_INK.PLENTY, image } = opts

    this.name = name
    this.type = type
    this.ink = ink
    this.maxSize = maxSize || 0
    this.minSize = minSize || 0
    this.image = image
  }

  /**
   * @return {Tiny.calligraphy.Brush}
   */
  clone() {
    return new Brush(this.name, {
      type: this.type,
      ink: this.ink,
      maxSize: this.maxSize,
      minSize: this.minSize,
      image: this.image,
    })
  }
}

/**
 * @name brushs
 * @memberof Tiny.calligraphy
 */
const brushs = {
  async getBrush(brushType, brushInk) {
    this[brushType].ink = brushInk
    // this[brushType].image = Texture.from(BRUSH_INK_IMAGE[brushInk])
    this[brushType].image = await Assets.load(BRUSH_INK_IMAGE[brushInk])

    return this[brushType].clone()
  },
}

/**
 * 增加一个笔刷
 *
 * @example
 * // 新增
 * Tiny.calligraphy.Brush.add('half_large', 50);
 * // 使用
 * tablet.selectBrush(Tiny.calligraphy.BRUSH_TYPE['half_large'.toUpperCase()]);
 *
 * @param {string} name         - 笔刷名称
 * @param {number} maxSize      - 笔刷在书写过程中的最大尺寸
 * @param {number} [minSize]  - 笔刷在书写过程中的最小尺寸
 */
Brush.add = (name, maxSize, minSize = 3) => {
  const type = name.toUpperCase()
  const key = Object.values(BRUSH_TYPE).pop() + 1

  BRUSH_TYPE[type] = key
  brushs[key] = new Brush(name, {
    type: key,
    maxSize,
    minSize,
  })
}

brushs[BRUSH_TYPE.SMALL] = new Brush('small', {
  type: BRUSH_TYPE.SMALL,
  maxSize: 15,
  minSize: 3,
})

brushs[BRUSH_TYPE.MIDDLE] = new Brush('middle', {
  type: BRUSH_TYPE.MIDDLE,
  maxSize: 40,
  minSize: 3,
})

brushs[BRUSH_TYPE.MEDIUM] = new Brush('medium', {
  type: BRUSH_TYPE.MEDIUM,
  maxSize: 40,
  minSize: 3,
})

brushs[BRUSH_TYPE.LARGE] = new Brush('large', {
  type: BRUSH_TYPE.LARGE,
  maxSize: 60,
  minSize: 3,
})

export {
  Brush,
  brushs,
}
