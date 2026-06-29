import type {
  BrowserMemorySnapshot,
  BrushPresetRegistry,
  MemoryEstimateEntry,
  MemoryRiskLevel,
  PainterMemorySnapshot,
  RasterLayer,
  StrokePatch,
  SurfaceBackend,
  SurfaceMemorySnapshot,
} from '@saier/core'
import type { DisplayMaskCapableBackend, ViewportPoint } from '@saier/pixi'
import type { PainterCanvas } from './canvas'
import type { PainterInputOptions, PainterPointerSource } from './input'
import {
  createDefaultBrushPresetRegistry,
  isEmpty,
  isIdentityTransform,
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
import { PainterPointerInput } from './input'
import { Keyboard } from './keyboard'
import { EditableLayer } from './layers'

import { statement } from './statement'
import { painterColorToRGBA } from './utils/color'
import 'pixi.js/math-extras'

const MEMORY_WATCH_BYTES = 256 * 1024 * 1024
const MEMORY_HIGH_BYTES = 768 * 1024 * 1024
const DEVICE_MEMORY_HIGH_RATIO = 0.25

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
  input?: PainterInputOptions

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

export interface PainterDocumentState {
  id: string
  name: string
  width: number
  height: number
  active: boolean
}

export interface CreatePainterDocumentOptions {
  id?: string
  name?: string
  width: number
  height: number
  defaultLayerLabel?: string
  activate?: boolean
}

interface PainterViewportState {
  x: number
  y: number
  scale: number
}

interface PainterDocumentSession {
  id: string
  name: string
  width: number
  height: number
  document: RasterDocument
  surface: SurfaceBackend
  undoManager: UndoManager
  history: PainterHistory
  layersContainer: Container
  boundingBoxes: Container
  surfaceLayerIds: Set<string>
  maskSurfaceIds: Set<string>
  viewport: PainterViewportState
  removeDocumentListener: () => void
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
  pointerInput?: PainterPointerInput
  inputPointerSource: PainterPointerSource = 'pixi'
  inputDiagnostics = false
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
  /** Whether brush / eraser paint onto the active layer's content or its mask. */
  paintTarget: 'content' | 'mask' = 'content'
  private readonly handleResize = () => this.onResize()
  private readonly documentSessions = new Map<string, PainterDocumentSession>()
  private readonly documentOrder: string[] = []
  private activeDocumentId: string | null = null
  private documentCounter = 0

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

    this.inputPointerSource = resolvePointerSource(this.options.input?.pointerSource)
    this.inputDiagnostics = this.options.input?.diagnostics ?? this.debug

    // board (created after the renderer exists)
    this.board = new PainterBoard(this)
    const boardContainer = this.board.container

    this.canvas = createCanvas(this)
    this.setupRasterPipeline()
    this.brush = createBrush(this)
    this.eraser = createEraser(this)
    const removePointerInput = this.setupPointerInput()

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
      removePointerInput()
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

  setupPointerInput(): () => void {
    if (this.inputPointerSource === 'dom') {
      this.pointerInput = new PainterPointerInput({
        painter: this,
        diagnostics: this.inputDiagnostics,
      })
      this.pointerInput.start()
      return () => {
        this.pointerInput?.destroy()
        this.pointerInput = undefined
      }
    }

    return this.setupPixiTouchGestures()
  }

  setupPixiTouchGestures(): () => void {
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
        panBy: (dx, dy) => this.panViewportBy(dx, dy),
        zoomAt: (point, scaleFactor) => this.zoomViewportAt(point, scaleFactor),
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
    return this.pointerInput?.isTouchGestureActive
      ?? this.touchGestureRouter?.isGestureActive
      ?? false
  }

  activeTouchCount(): number {
    return this.pointerInput?.activeTouchCount
      ?? this.touchGestureRouter?.activeTouchCount
      ?? 0
  }

  panViewportBy(dx: number, dy: number): void {
    this.board.container.position.set(
      this.board.container.position.x + dx,
      this.board.container.position.y + dy,
    )
    this.boundingBoxes.position.set(
      this.boundingBoxes.position.x + dx,
      this.boundingBoxes.position.y + dy,
    )
  }

  zoomViewportAt(point: ViewportPoint, scaleFactor: number): void {
    const board = this.board.container
    const scale = Math.max(board.scale.x * scaleFactor, this.board.minScale)
    const docX = (point.x - board.position.x) / board.scale.x
    const docY = (point.y - board.position.y) / board.scale.y
    board.position.set(point.x - docX * scale, point.y - docY * scale)
    this.boundingBoxes.position.set(board.position.x, board.position.y)
    this.canvas.scaleTo(scale)
  }

  setupRasterPipeline() {
    const {
      boardSize = {
        width: 512,
        height: 512,
      },
    } = this.options
    const session = this.createDocumentSession({
      id: 'document-1',
      name: 'Canvas 1',
      width: boardSize.width,
      height: boardSize.height,
      defaultLayerLabel: 'Layer 1',
    })
    this.documentCounter = 1
    this.documentSessions.set(session.id, session)
    this.documentOrder.push(session.id)
    this.activeDocumentId = session.id
    this.activateSession(session)
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
  }

  createSurfaceBackend(width: number, height: number, stage = this.canvas.layersContainer): SurfaceBackend {
    if (this.options.backend === 'rendertexture') {
      return new RenderTextureBackend({
        renderer: this.app.renderer,
        stage,
        width,
        height,
      })
    }

    return new PixiTileTextureBackend({
      renderer: this.app.renderer,
      stage,
      width,
      height,
    })
  }

  getDocuments(): PainterDocumentState[] {
    return this.documentOrder
      .map(id => this.documentSessions.get(id))
      .filter((session): session is PainterDocumentSession => Boolean(session))
      .map(session => this.toDocumentState(session))
  }

  getActiveDocumentId(): string {
    return this.requireActiveSession().id
  }

  createDocument(options: CreatePainterDocumentOptions): PainterDocumentState {
    const width = normalizeDocumentDimension(options.width)
    const height = normalizeDocumentDimension(options.height)
    const id = options.id ?? this.nextDocumentId()
    if (this.documentSessions.has(id))
      throw new Error(`Document id already exists: ${id}`)

    this.cancelActiveStroke()
    const session = this.createDocumentSession({
      ...options,
      id,
      name: options.name?.trim() || `Canvas ${this.documentOrder.length + 1}`,
      width,
      height,
    })
    this.documentSessions.set(session.id, session)
    this.documentOrder.push(session.id)

    if (options.activate ?? true)
      this.switchDocument(session.id)
    else
      session.layersContainer.visible = false

    this.emitDocumentsChange()
    return this.toDocumentState(session)
  }

  switchDocument(id: string): void {
    const next = this.documentSessions.get(id)
    if (!next)
      throw new Error(`Unknown document: ${id}`)
    const current = this.activeDocumentId ? this.documentSessions.get(this.activeDocumentId) : undefined
    if (current?.id === next.id)
      return

    this.cancelActiveStroke()
    if (current) {
      this.saveViewport(current)
      current.layersContainer.visible = false
      current.boundingBoxes.visible = false
    }

    this.activeDocumentId = next.id
    this.activateSession(next)
    this.controller.bind({
      document: next.document,
      history: next.undoManager,
    })
    this.useTool(this.tool as PainterTool)
    this.emitActiveDocumentChange(next)
  }

  closeDocument(id: string): void {
    const session = this.documentSessions.get(id)
    if (!session || this.documentOrder.length <= 1)
      return

    const index = this.documentOrder.indexOf(id)
    const wasActive = this.activeDocumentId === id
    if (wasActive) {
      const nextId = this.documentOrder[index + 1] ?? this.documentOrder[index - 1]
      if (nextId)
        this.switchDocument(nextId)
    }

    this.destroySession(session)
    this.documentSessions.delete(id)
    this.documentOrder.splice(index, 1)
    this.emitDocumentsChange()
  }

  renameDocument(id: string, name: string): void {
    const session = this.documentSessions.get(id)
    const next = name.trim()
    if (!session || !next || session.name === next)
      return
    session.name = next
    this.emitDocumentsChange()
  }

  flushSurfaceUploads() {
    this.surface.flushUploads?.()
  }

  getMemorySnapshot(): PainterMemorySnapshot {
    return this.createMemorySnapshot()
  }

  async measureMemory(): Promise<PainterMemorySnapshot> {
    return this.createMemorySnapshot(await measureBrowserMemory())
  }

  recordStrokePatch(patch: StrokePatch) {
    if (isEmpty(patch.rect))
      return

    // a stroke on any layer may change a clip/mask source → refresh derived displays
    this.refreshDerivedDisplays(patch.rect)
    const undoManager = this.undoManager
    undoManager.record(patch)
    this.history.record({
      undo: () => {
        undoManager.undo()
        this.refreshDerivedDisplays(patch.rect)
      },
      redo: () => {
        undoManager.redo()
        this.refreshDerivedDisplays(patch.rect)
      },
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
      context?.drawImage(canvas as unknown as CanvasImageSource, 0, 0, size, size)
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

    const session = this.requireActiveSession()
    const layer = new EditableLayer(this)
    layer.eventMode = 'static'
    layer.label = `Image ${EditableLayer.order++}`
    session.layersContainer.addChild(layer)
    layer.addChild(imgSprite)
    layer.updateTransformBoundingBox()

    session.boundingBoxes.addChild(layer.boundingBoxContainer)

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
    const session = this.requireActiveSession()
    session.boundingBoxes.visible = true
    session.layersContainer.children.forEach((layer) => {
      layer.children?.forEach((child) => {
        child.cursor = 'move'
      })
    })
  }

  hideBoundingBox() {
    const session = this.requireActiveSession()
    session.boundingBoxes.visible = false
    session.layersContainer.children.forEach((layer) => {
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
    const current = this.requireActiveSession()
    this.cancelActiveStroke()
    this.saveViewport(current)
    const replacement = this.createDocumentSession({
      id: current.id,
      name: current.name,
      width: current.width,
      height: current.height,
      defaultLayerLabel: 'Layer 1',
    })
    replacement.viewport = { ...current.viewport }
    this.destroySession(current)
    this.documentSessions.set(replacement.id, replacement)
    this.activeDocumentId = replacement.id
    this.activateSession(replacement)
    this.controller.bind({
      document: replacement.document,
      history: replacement.undoManager,
    })
    this.useTool(this.tool as PainterTool)
    this.emitter.emit('canvas:clear')
    this.emitActiveDocumentChange(replacement)
  }

  destroy() {
    this.removeEventListeners()
    this.brush.destroy()
    this.eraser.destroy()
    this.controller.dispose()
    for (const session of this.documentSessions.values())
      this.destroySession(session)
    this.documentSessions.clear()
    this.documentOrder.length = 0
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

  private createDocumentSession(options: Required<Pick<CreatePainterDocumentOptions, 'id' | 'name' | 'width' | 'height'>> & Pick<CreatePainterDocumentOptions, 'defaultLayerLabel'>): PainterDocumentSession {
    const layersContainer = new Container()
    layersContainer.label = `${options.id}:layers`
    const boundingBoxes = new Container()
    boundingBoxes.label = `${options.id}:boundingBoxes`

    this.canvas.documentsContainer.addChild(layersContainer)
    this.boundingBoxes.addChild(boundingBoxes)

    const document = new RasterDocument({ width: options.width, height: options.height })
    const surface = this.createSurfaceBackend(options.width, options.height, layersContainer)
    const undoManager = new UndoManager({ backend: surface })
    const history = new PainterHistory(this)
    const session: PainterDocumentSession = {
      id: options.id,
      name: options.name,
      width: options.width,
      height: options.height,
      document,
      surface,
      undoManager,
      history,
      layersContainer,
      boundingBoxes,
      surfaceLayerIds: new Set(),
      maskSurfaceIds: new Set(),
      viewport: this.defaultViewport(),
      removeDocumentListener: () => {},
    }
    const handleLayersChange = (event: { layers: RasterLayer[] }) => {
      this.syncSurfaceLayers(event.layers, session)
    }
    document.on('layers:change', handleLayersChange)
    session.removeDocumentListener = () => {
      document.off('layers:change', handleLayersChange)
    }

    const layer = document.addLayer({
      id: 'layer-1',
      label: options.defaultLayerLabel ?? 'Layer 1',
    })
    this.syncSurfaceLayers([layer], session)
    layersContainer.visible = false
    boundingBoxes.visible = false
    return session
  }

  private activateSession(session: PainterDocumentSession): void {
    this.document = session.document
    this.surface = session.surface
    this.undoManager = session.undoManager
    this.history = session.history
    this.canvas.layersContainer = session.layersContainer
    if (this.brush)
      this.brush.parentContainer = session.layersContainer
    if (this.eraser)
      this.eraser.parentContainer = session.layersContainer
    this.canvas.resizeDocument(session.width, session.height)
    session.layersContainer.visible = true
    session.boundingBoxes.visible = true
    this.restoreViewport(session)
  }

  private destroySession(session: PainterDocumentSession): void {
    session.removeDocumentListener()
    session.surface.destroy()
    session.surfaceLayerIds.clear()
    session.maskSurfaceIds.clear()
    session.history.clear()
    this.canvas.documentsContainer.removeChild(session.layersContainer)
    this.boundingBoxes.removeChild(session.boundingBoxes)
    session.layersContainer.destroy({ children: true })
    session.boundingBoxes.destroy({ children: true })
  }

  private requireActiveSession(): PainterDocumentSession {
    const session = this.activeDocumentId ? this.documentSessions.get(this.activeDocumentId) : undefined
    if (!session)
      throw new Error('Painter has no active document')
    return session
  }

  private toDocumentState(session: PainterDocumentSession): PainterDocumentState {
    return {
      id: session.id,
      name: session.name,
      width: session.width,
      height: session.height,
      active: session.id === this.activeDocumentId,
    }
  }

  private nextDocumentId(): string {
    let id: string
    do {
      this.documentCounter += 1
      id = `document-${this.documentCounter}`
    } while (this.documentSessions.has(id))
    return id
  }

  private defaultViewport(): PainterViewportState {
    const width = this.app.canvas.width / this.app.renderer.resolution
    const height = this.app.canvas.height / this.app.renderer.resolution
    return {
      x: width / 2,
      y: height / 2,
      scale: 1,
    }
  }

  private saveViewport(session: PainterDocumentSession): void {
    session.viewport = {
      x: this.board.container.position.x,
      y: this.board.container.position.y,
      scale: this.board.container.scale.x,
    }
  }

  private restoreViewport(session: PainterDocumentSession): void {
    this.board.container.position.set(session.viewport.x, session.viewport.y)
    this.boundingBoxes.position.set(session.viewport.x, session.viewport.y)
    this.canvas.scaleTo(session.viewport.scale)
  }

  private cancelActiveStroke(): void {
    this.brush?.cancelStroke()
    this.eraser?.cancelStroke()
  }

  private emitDocumentsChange(): void {
    if (!this.activeDocumentId)
      return
    this.emitter.emit('documents:change', {
      documents: this.getDocuments(),
      activeDocumentId: this.activeDocumentId,
    })
  }

  private emitActiveDocumentChange(session: PainterDocumentSession): void {
    this.emitter.emit('active-document:change', {
      document: this.toDocumentState(session),
      documents: this.getDocuments(),
    })
    this.emitDocumentsChange()
  }

  private syncSurfaceLayers(layers: RasterLayer[], session = this.requireActiveSession()): void {
    const nextIds = new Set(layers.map(layer => layer.id))

    for (const id of [...session.surfaceLayerIds]) {
      if (!nextIds.has(id)) {
        session.surface.removeLayer(id)
        session.surfaceLayerIds.delete(id)
      }
    }

    for (const layer of layers) {
      if (!session.surfaceLayerIds.has(layer.id)) {
        session.surface.createLayer(layer.id)
        session.surfaceLayerIds.add(layer.id)
      }

      session.surface.setLayerState?.(layer.id, {
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        lockAlpha: layer.lockAlpha,
      })
      this.applyLayerDisplayTransform(layer, session)
    }

    session.surface.reorderLayers?.(layers.map(layer => layer.id))
    this.syncDisplayMasks(layers, session)
  }

  /**
   * Wire up clip / mask display masking for backends that expose the optional
   * derived-display capability. A layer with an enabled mask is masked by its
   * hidden, paintable mask surface; otherwise a clip layer is masked by the
   * layer directly below.
   */
  private syncDisplayMasks(layers: RasterLayer[], session = this.requireActiveSession()): void {
    if (!isDisplayMaskCapableBackend(session.surface))
      return
    const displayMasks = session.surface

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!
      const belowId = i > 0 ? layers[i - 1]!.id : undefined

      if (layer.mask && !displayMasks.hasLayer(layer.mask.id)) {
        displayMasks.createHiddenLayer(layer.mask.id)
        displayMasks.fillLayerOpaque(layer.mask.id) // fresh mask reveals everything
        session.maskSurfaceIds.add(layer.mask.id)
      }

      // Layer mask → luminance (grayscale: white reveals, black/erased hides).
      // Clip layer → alpha (shows only where the layer below is opaque).
      if (layer.mask?.enabled)
        displayMasks.setLayerDisplayMask(layer.id, layer.mask.id, 'luminance')
      else if (layer.clip && belowId)
        displayMasks.setLayerDisplayMask(layer.id, belowId, 'alpha')
      else
        displayMasks.setLayerDisplayMask(layer.id, undefined)
    }

    // release mask surfaces whose layer dropped its mask
    const referenced = new Set(layers.filter(l => l.mask).map(l => l.mask!.id))
    for (const maskId of [...session.maskSurfaceIds]) {
      if (!referenced.has(maskId)) {
        if (displayMasks.hasLayer(maskId))
          displayMasks.removeLayer(maskId)
        session.maskSurfaceIds.delete(maskId)
      }
    }
  }

  /** Resolve which surface a stroke paints into (content layer or its mask). */
  resolvePaintLayerId(activeLayerId: string): string {
    if (this.paintTarget === 'mask') {
      const layer = this.document.getLayer(activeLayerId)
      if (layer?.mask?.enabled)
        return layer.mask.id
    }
    return activeLayerId
  }

  setPaintTarget(target: 'content' | 'mask'): void {
    this.paintTarget = target
  }

  /** Recompute derived clip / mask display textures after pixels change. */
  private refreshDerivedDisplays(dirtyRect?: StrokePatch['rect']): void {
    const session = this.requireActiveSession()
    if (isDisplayMaskCapableBackend(session.surface))
      session.surface.refreshDerivedDisplays(dirtyRect)
  }

  /**
   * Place the layer's display handle. Layer pixels live in layer-local space; the
   * forward {@link LayerTransform} (plus the document-centering offset) maps them
   * back into document / screen space. Painting applies the inverse (see brush
   * `toLayerLocalDab`) so a dab dropped at a document point lands correctly.
   */
  private applyLayerDisplayTransform(layer: RasterLayer, session = this.requireActiveSession()): void {
    const handle = session.surface.getDisplayHandle(layer.id)
    if (!(handle instanceof Sprite || handle instanceof Container))
      return

    const cx = session.surface.width / 2
    const cy = session.surface.height / 2
    const t = layer.transform

    if (!t || isIdentityTransform(t)) {
      handle.pivot.set(0, 0)
      handle.scale.set(1, 1)
      handle.rotation = 0
      handle.position.set(-cx, -cy)
      return
    }

    handle.pivot.set(t.anchorX, t.anchorY)
    handle.scale.set(t.scaleX, t.scaleY)
    handle.rotation = t.rotation
    handle.position.set(t.x - cx, t.y - cy)
  }

  private createMemorySnapshot(browser?: BrowserMemorySnapshot): PainterMemorySnapshot {
    this.flushSurfaceUploads()

    const surface = this.surface.getMemorySnapshot?.() ?? createFallbackSurfaceMemorySnapshot(this.surface)
    const undo = this.undoManager.getMemorySnapshot()
    const totalEstimatedBytes = surface.totalEstimatedBytes + undo.totalEstimatedBytes
    const deviceMemoryBytes = getDeviceMemoryBytes()

    return {
      totalEstimatedBytes,
      riskLevel: getMemoryRiskLevel(totalEstimatedBytes, deviceMemoryBytes),
      surface,
      undo,
      browser,
      deviceMemoryBytes,
    }
  }
}

export function createPainter(options: PainterOptions): Painter {
  statement()

  return new Painter(options)
}

function resolvePointerSource(source?: PainterPointerSource): PainterPointerSource {
  if (source)
    return source
  return typeof globalThis.PointerEvent === 'function' ? 'dom' : 'pixi'
}

function normalizeDocumentDimension(value: number): number {
  if (!Number.isFinite(value))
    throw new Error('Document dimensions must be finite numbers')
  const next = Math.round(value)
  if (next <= 0)
    throw new Error('Document dimensions must be positive')
  return next
}

function createFallbackSurfaceMemorySnapshot(surface: SurfaceBackend): SurfaceMemorySnapshot {
  return {
    source: 'unknown',
    width: surface.width,
    height: surface.height,
    totalEstimatedBytes: 0,
    entries: [],
  }
}

type DisplayMaskSurfaceBackend = SurfaceBackend & DisplayMaskCapableBackend

function isDisplayMaskCapableBackend(surface: SurfaceBackend): surface is DisplayMaskSurfaceBackend {
  const maybe = surface as Partial<DisplayMaskCapableBackend>
  return typeof maybe.hasLayer === 'function'
    && typeof maybe.createHiddenLayer === 'function'
    && typeof maybe.fillLayerOpaque === 'function'
    && typeof maybe.setLayerDisplayMask === 'function'
    && typeof maybe.refreshDerivedDisplays === 'function'
}

function getMemoryRiskLevel(totalEstimatedBytes: number, deviceMemoryBytes?: number): MemoryRiskLevel {
  if (deviceMemoryBytes && totalEstimatedBytes >= deviceMemoryBytes * DEVICE_MEMORY_HIGH_RATIO)
    return 'high'
  if (totalEstimatedBytes >= MEMORY_HIGH_BYTES)
    return 'high'
  if (totalEstimatedBytes >= MEMORY_WATCH_BYTES)
    return 'watch'
  return 'normal'
}

function getDeviceMemoryBytes(): number | undefined {
  const memory = (globalThis.navigator as NavigatorWithDeviceMemory | undefined)?.deviceMemory
  return typeof memory === 'number' && Number.isFinite(memory) && memory > 0
    ? memory * 1024 * 1024 * 1024
    : undefined
}

async function measureBrowserMemory(): Promise<BrowserMemorySnapshot | undefined> {
  const performance = globalThis.performance as MemoryPerformance | undefined
  if (!performance)
    return undefined

  if (
    typeof performance.measureUserAgentSpecificMemory === 'function'
    && globalThis.crossOriginIsolated
  ) {
    try {
      const result = await performance.measureUserAgentSpecificMemory()
      return {
        source: 'measureUserAgentSpecificMemory',
        bytes: result.bytes,
        entries: [
          {
            id: 'browser:user-agent-specific-memory',
            label: 'Browser page memory',
            bytes: result.bytes,
            kind: 'browser',
          },
        ],
        metadata: {
          breakdownCount: result.breakdown?.length ?? 0,
        },
      }
    }
    catch {
      // Fall back to Chromium's JS heap counters when the stronger API rejects.
    }
  }

  const memory = performance.memory
  if (!memory)
    return undefined

  const entries: MemoryEstimateEntry[] = [
    {
      id: 'browser:used-js-heap',
      label: 'Browser JS heap used',
      bytes: memory.usedJSHeapSize,
      kind: 'browser',
    },
  ]

  return {
    source: 'performance.memory',
    bytes: memory.usedJSHeapSize,
    entries,
    metadata: {
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      totalJSHeapSize: memory.totalJSHeapSize,
    },
  }
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number
}

interface MemoryPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
  measureUserAgentSpecificMemory?: () => Promise<{
    bytes: number
    breakdown?: unknown[]
  }>
}
