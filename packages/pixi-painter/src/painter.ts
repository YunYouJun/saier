import type { PainterCanvas } from './canvas'
import { Application, Container } from 'pixi.js'
import { PainterBoard } from './board'
import { createBrush, PainterBrush } from './brush'
import { createCanvas } from './canvas'
import { addImageDropListener } from './dom'
import { createEraser, PainterEraser } from './eraser'
import { createEmitter } from './event'
import { PainterHistory } from './features/history'
import { importImageSprite } from './import'
import { Keyboard } from './keyboard'
import { EditableLayer } from './layers'

import { statement } from './statement'
import 'pixi.js/math-extras'

export const PAINTER_TOOLS = [
  'brush',
  'drag',
  'eraser',
  'image',
  'selection',
] as const

export type PainterTool = typeof PAINTER_TOOLS[number]

export interface PainterOptions {
  debug?: boolean

  size?: {
    width: number
    height: number
  }
  boardSize?: {
    width: number
    height: number
  }

  /**
   * PIXI.Application.view
   */
  view: HTMLCanvasElement
  // ...
  resolution?: number

  /**
   * override PIXI.Application options
   */
  pixiOptions?: Parameters<Application['init']>[0]
}

export interface PainterStore {}

export function createStore(_options: PainterOptions): PainterStore {
  return { }
}

export class Painter {
  debug = false

  tool = 'brush'

  options: PainterOptions
  app: Application
  emitter = createEmitter()
  keyboard = new Keyboard(this)

  /**
   * board
   * canvas is board's child
   */
  board!: PainterBoard
  boundingBoxes = new Container()
  /**
   * not HTMLCanvasElement
   * workspace canvas
   * workspace is app.stage
   */
  canvas!: PainterCanvas
  brush!: PainterBrush
  eraser!: PainterEraser
  store!: PainterStore

  history = new PainterHistory(this)

  /**
   * context menu
   */
  contextMenu = new Container()

  /**
   * pointer in stage
   */
  isPointerInStage = false

  constructor(options: PainterOptions) {
    this.options = options
    const { debug = false } = options

    // v8: `Application` is async-init. The constructor only constructs the
    // instance; everything that needs the renderer / stage moves into `init()`.
    this.app = new Application()

    if (debug)
      this.debug = debug
  }

  /**
   * init
   *
   * v8 requires `await app.init()` before the renderer / stage are usable, so
   * all renderer-dependent setup lives here rather than in the constructor.
   */
  async init() {
    const {
      size: { width, height } = { width: 768, height: 768 },
      resolution = window.devicePixelRatio || 1,
      pixiOptions = {},
    } = this.options

    await this.app.init({
      canvas: this.options.view, // v7 `view` → v8 `canvas`
      background: 0x333333, // v7 `backgroundColor` → v8 `background`
      width,
      height,
      antialias: true,
      resolution,
      preference: 'webgl', // production renderer (see docs/design D3)
      ...pixiOptions,
    })

    const { app } = this
    const stage = app.stage
    stage.eventMode = 'static'
    stage.hitArea = app.screen

    if (this.debug) {
      // @ts-expect-error pixi-inspector
      globalThis.__PIXI_APP__ = app
    }

    // board (created after the renderer exists)
    this.board = new PainterBoard(this)
    const boardContainer = this.board.container

    this.canvas = createCanvas(this)
    this.brush = createBrush(this)
    this.eraser = createEraser(this)

    // add canvas to stage to draw
    boardContainer.addChild(this.canvas.container)

    this.store = createStore(this.options)

    stage.label = 'stage'
    stage.addChild(this.board.container)

    // boxes
    this.boundingBoxes.label = 'boundingBoxes'
    this.boundingBoxes.x = app.canvas.width / app.renderer.resolution / 2
    this.boundingBoxes.y = app.canvas.height / app.renderer.resolution / 2
    stage.addChild(this.boundingBoxes)

    this.options.view.addEventListener('contextmenu', (e) => {
      e.preventDefault()
    })

    stage.sortChildren()
    stage.on('pointerenter', () => {
      this.isPointerInStage = true
    })
    const onPointerLeave = () => {
      this.isPointerInStage = false
    }
    stage.on('pointerleave', onPointerLeave)
    stage.on('pointerupoutside', onPointerLeave)
    stage.on('pointercancel', onPointerLeave)

    // image drag-and-drop import
    addImageDropListener(this, this.options.view)

    // window listeners + default tool
    this.removeEventListeners = this.addEventListeners()
    this.useTool('brush')
  }

  onResize() {
    const view = this.app.canvas
    if (!view)
      return
    const box = view.getBoundingClientRect?.()
    if (box) {
      const { width, height } = box
      this.app.renderer.resize(width, height)
    }
  }

  addEventListeners() {
    // resize
    window.addEventListener('resize', this.onResize.bind(this))
    return () => {
      window.removeEventListener('resize', this.onResize.bind(this))
    }
  }

  removeEventListeners() { }

  /**
   * board background
   * set background color
   * background.color = 0x000000
   */
  get background() {
    return this.app.renderer.background
  }

  /**
   * toggle to selection when image loaded
   */
  async loadImage(src: string, options: {
    autoToggleSelection?: boolean
  } = {
    autoToggleSelection: true,
  }) {
    const imgSprite = await importImageSprite(src)
    imgSprite.name = src

    const { canvas } = this
    const layer = new EditableLayer(this)
    layer.eventMode = 'static'
    layer.name = `Image ${EditableLayer.order++}`
    canvas.layersContainer.addChild(layer)
    layer.addChild(imgSprite)
    layer.updateTransformBoundingBox()

    this.boundingBoxes.addChild(layer.boundingBoxContainer)

    this.history.record({
      undo: () => {
        layer.visible = false
        layer.boundingBoxContainer.visible = false
      },
      redo: () => {
        layer.visible = true
        layer.boundingBoxContainer.visible = true
      },
    })

    if (options.autoToggleSelection)
      this.useTool('selection')
  }

  showBoundingBox() {
    this.boundingBoxes.visible = true
    this.canvas.layersContainer.children.forEach((layer) => {
      layer.children?.forEach((child) => {
        child.cursor = 'move'
      })
    })
  }

  hideBoundingBox() {
    this.boundingBoxes.visible = false
    this.canvas.layersContainer.children.forEach((layer) => {
      layer.children?.forEach((child) => {
        child.cursor = 'default'
      })
    })
  }

  /**
   * toggle tool
   */
  useTool(name: PainterTool) {
    this.emitter.emit('tool:change', name)
    this.tool = name

    PainterBrush.enabled = false
    PainterEraser.enabled = false
    this.board.dragMode = false
    this.hideBoundingBox()
    this.app.stage.cursor = 'default'
    this.brush.circle.visible = false

    switch (name) {
      case 'drag':
        this.useDrag()
        break
      case 'brush':
        this.useBrush()
        break
      case 'eraser':
        this.useEraser()
        break
      case 'selection':
        this.useSelection()
        break
      case 'image':
        this.useImage()
        break
      default:
        break
    }
  }

  useDrag() {
    this.board.dragMode = true
  }

  useBrush() {
    this.brush.circle.visible = true
    PainterBrush.enabled = true
    this.app.stage.cursor = 'none'
  }

  useEraser() {
    this.brush.circle.visible = true
    PainterEraser.enabled = true
    this.app.stage.cursor = 'none'
  }

  useSelection() {
    this.app.stage.cursor = 'crosshair'
    this.showBoundingBox()
  }

  cancelSelection() {
    this.hideBoundingBox()
  }

  useImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file)
        return

      this.loadImage(URL.createObjectURL(file))
    }
    input.click()
  }

  /**
   * @default
   */
  async extractCanvas(type: 'image' | 'base64' | 'canvas' | 'pixels' = 'image') {
    const { app } = this
    const target = this.board.container
    if (type === 'image')
      return app.renderer.extract.image(target)
    else if (type === 'base64')
      return app.renderer.extract.base64(target)
    else if (type === 'canvas')
      return app.renderer.extract.canvas(target)
    else if (type === 'pixels')
      return app.renderer.extract.pixels(target)
    else
      throw new Error(`unknown type: ${type}`)
  }

  /**
   * clear content in inner canvas
   */
  clearCanvas() {
    this.canvas.clearLayers()
    this.boundingBoxes.removeChildren()
  }

  destroy() {
    this.removeEventListeners()
    this.brush.destroy()
    this.eraser.destroy()
    this.board.destroy()

    this.app.destroy(false, {
      children: true,
      texture: true,
      textureSource: true,
    })
  }

  // helper
  zoomIn() {
    this.canvas.scaleUp()
  }

  zoomOut() {
    this.canvas.scaleDown()
  }

  // 缩小画笔尺寸
  brushSizeDown() {
    this.brush.sizeDown()
  }

  brushSizeUp() {
    this.brush.sizeUp()
  }
}

export function createPainter(options: PainterOptions): Painter {
  statement()

  return new Painter(options)
}
