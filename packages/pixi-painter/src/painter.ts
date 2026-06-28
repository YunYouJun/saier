import type { BrushPresetRegistry, RasterLayer, StrokePatch, SurfaceBackend } from '@saier/core'
import type { PainterCanvas } from './canvas'
import {
  createDefaultBrushPresetRegistry,
  isEmpty,
  PainterController,
  Document as RasterDocument,
  UndoManager,
} from '@saier/core'
import { PixiTileTextureBackend, RenderTextureBackend, TouchGestureRouter } from '@saier/pixi'
import { Application, Container, Sprite } from 'pixi.js'
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
import { painterColorToRGBA } from './utils/color'
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
  backend?: 'rendertexture' | 'tiled'

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
  document!: RasterDocument
  surface!: SurfaceBackend
  undoManager!: UndoManager
  controller!: PainterController
  brushRegistry: BrushPresetRegistry = createDefaultBrushPresetRegistry()
  touchGestureRouter!: TouchGestureRouter
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
  private readonly handleResize = () => this.onResize()
  private readonly surfaceLayerIds = new Set<string>()
  private readonly handleDocumentLayersChange = (event: { layers: RasterLayer[] }) => {
    this.syncSurfaceLayers(event.layers)
  }

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
      useBackBuffer: true, // required by Pixi advanced layer blend modes on WebGL
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
    this.setupRasterPipeline()
    this.brush = createBrush(this)
    this.eraser = createEraser(this)
    const removeTouchGestures = this.setupTouchGestures()

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
    const removeWindowListeners = this.addEventListeners()
    this.removeEventListeners = () => {
      removeWindowListeners()
      removeTouchGestures()
    }
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
    window.addEventListener('resize', this.handleResize)
    return () => {
      window.removeEventListener('resize', this.handleResize)
    }
  }

  removeEventListeners() { }

  setupTouchGestures(): () => void {
    const canvas = this.app.canvas
    const localEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        clientX: event.clientX - rect.left,
        clientY: event.clientY - rect.top,
      }
    }

    this.touchGestureRouter = new TouchGestureRouter({
      viewport: {
        panBy: (dx, dy) => {
          this.board.container.position.set(
            this.board.container.position.x + dx,
            this.board.container.position.y + dy,
          )
          this.boundingBoxes.position.set(
            this.boundingBoxes.position.x + dx,
            this.boundingBoxes.position.y + dy,
          )
        },
        zoomAt: (point, scaleFactor) => {
          const board = this.board.container
          const scale = Math.max(board.scale.x * scaleFactor, this.board.minScale)
          const docX = (point.x - board.position.x) / board.scale.x
          const docY = (point.y - board.position.y) / board.scale.y
          board.position.set(point.x - docX * scale, point.y - docY * scale)
          this.boundingBoxes.position.set(board.position.x, board.position.y)
          this.canvas.scaleTo(scale)
        },
      },
      onStrokeCancel: () => {
        this.brush.cancelStroke()
        this.eraser.cancelStroke()
      },
    })

    const onPointerDown = (event: PointerEvent) => this.touchGestureRouter.pointerDown(localEvent(event))
    const onPointerMove = (event: PointerEvent) => this.touchGestureRouter.pointerMove(localEvent(event))
    const onPointerUp = (event: PointerEvent) => this.touchGestureRouter.pointerUp(localEvent(event))
    const onPointerCancel = (event: PointerEvent) => this.touchGestureRouter.pointerCancel(localEvent(event))

    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
    }
  }

  isTouchGestureActive(): boolean {
    return this.touchGestureRouter?.isGestureActive ?? false
  }

  activeTouchCount(): number {
    return this.touchGestureRouter?.activeTouchCount ?? 0
  }

  setupRasterPipeline() {
    const { width, height } = PainterBoard.size
    this.document = new RasterDocument({ width, height })
    this.surface = this.createSurfaceBackend(width, height)
    this.undoManager = new UndoManager({ backend: this.surface })
    this.controller = new PainterController({
      document: this.document,
      history: this.undoManager,
      tool: this.tool,
      brushPresets: this.brushRegistry.list(),
      brush: {
        presetId: PainterBrush.presetId,
        size: PainterBrush.size,
        color: painterColorToRGBA(PainterBrush.color),
      },
    })
    this.document.on('layers:change', this.handleDocumentLayersChange)

    const layer = this.document.addLayer({ id: 'layer-1', label: 'Layer 1' })
    this.syncSurfaceLayers([layer])
  }

  createSurfaceBackend(width: number, height: number): SurfaceBackend {
    if (this.options.backend === 'tiled') {
      return new PixiTileTextureBackend({
        renderer: this.app.renderer,
        stage: this.canvas.layersContainer,
        width,
        height,
      })
    }

    return new RenderTextureBackend({
      renderer: this.app.renderer,
      stage: this.canvas.layersContainer,
      width,
      height,
    })
  }

  flushSurfaceUploads() {
    if (this.surface instanceof PixiTileTextureBackend)
      this.surface.flushUploads()
  }

  recordStrokePatch(patch: StrokePatch) {
    if (isEmpty(patch.rect))
      return

    this.undoManager.record(patch)
    this.history.record({
      undo: () => this.undoManager.undo(),
      redo: () => this.undoManager.redo(),
    })
  }

  async extractLayerThumbnail(layerId: string, size = 48): Promise<string> {
    const handle = this.surface.getDisplayHandle(layerId)
    if (!(handle instanceof Sprite || handle instanceof Container))
      throw new TypeError('Unsupported layer display handle')

    const visible = handle.visible
    const alpha = handle.alpha
    handle.visible = true
    handle.alpha = 1

    try {
      const canvas = await this.app.renderer.extract.canvas({ target: handle })
      const thumb = document.createElement('canvas')
      thumb.width = size
      thumb.height = size
      const context = thumb.getContext('2d')
      context?.clearRect(0, 0, size, size)
      context?.drawImage(canvas, 0, 0, size, size)
      return thumb.toDataURL('image/png')
    }
    finally {
      handle.visible = visible
      handle.alpha = alpha
    }
  }

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
    imgSprite.label = src

    const { canvas } = this
    const layer = new EditableLayer(this)
    layer.eventMode = 'static'
    layer.label = `Image ${EditableLayer.order++}`
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
    this.controller?.setTool(name)
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
    this.document.off('layers:change', this.handleDocumentLayersChange)
    this.controller.dispose()
    this.surface.destroy()
    this.surfaceLayerIds.clear()
    this.history.clear()
    this.canvas.clearLayers()
    this.boundingBoxes.removeChildren()
    this.setupRasterPipeline()
    this.emitter.emit('canvas:clear')
  }

  destroy() {
    this.removeEventListeners()
    this.brush.destroy()
    this.eraser.destroy()
    this.document.off('layers:change', this.handleDocumentLayersChange)
    this.controller.dispose()
    this.surface.destroy()
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

  private syncSurfaceLayers(layers: RasterLayer[]): void {
    const nextIds = new Set(layers.map(layer => layer.id))

    for (const id of [...this.surfaceLayerIds]) {
      if (!nextIds.has(id)) {
        this.surface.removeLayer(id)
        this.surfaceLayerIds.delete(id)
      }
    }

    for (const layer of layers) {
      if (!this.surfaceLayerIds.has(layer.id)) {
        this.surface.createLayer(layer.id)
        this.surfaceLayerIds.add(layer.id)
        this.positionSurfaceLayer(layer.id)
      }

      this.surface.setLayerState?.(layer.id, {
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
      })
    }

    this.surface.reorderLayers?.(layers.map(layer => layer.id))
  }

  private positionSurfaceLayer(layerId: string): void {
    const handle = this.surface.getDisplayHandle(layerId)
    if (handle instanceof Sprite || handle instanceof Container)
      handle.position.set(-this.surface.width / 2, -this.surface.height / 2)
  }
}

export function createPainter(options: PainterOptions): Painter {
  statement()

  return new Painter(options)
}
