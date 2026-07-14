import type {
  BrowserMemorySnapshot,
  BrushEngineRegistration,
  BrushEngineRegistry,
  BrushInputPoint,
  BrushPreset,
  BrushPresetRegistry,
  DirtyRect,
  DocumentLayersChangeEvent,
  LayerNode,
  LayerTransform,
  MemoryEstimateEntry,
  MemoryRiskLevel,
  PainterMemorySnapshot,
  RasterLayer,
  SaierProjectFile,
  SaierProjectMetadata,
  SaierStrokeCommit,
  StrokePatch,
  SurfaceBackend,
  SurfaceMemorySnapshot,
  TiledSurface,
} from '@saier/core'
import type { DisplayMaskCapableBackend, ViewportPoint } from '@saier/pixi'
import type { PainterCanvas } from './canvas'
import type { PainterStrokeCommittedEvent, PainterStrokeEventScope, PainterStrokePreviewEvent } from './event'
import type { PainterInputOptions, PainterPointerSource } from './input'
import {
  createDefaultBrushEngineRegistry,
  createDefaultBrushPresetRegistry,
  createLayerTransform,
  deserializeSaierProject,
  isEmpty,
  isIdentityTransform,
  PainterController,
  Document as RasterDocument,
  serializeSaierProject,
  UndoManager,
} from '@saier/core'
import { PixiTileTextureBackend, RenderTextureBackend, TouchGestureRouter } from '@saier/pixi'
import { Application, Container, Rectangle, Sprite } from 'pixi.js'
import { PainterBoard } from './board'
import { createBrush, PainterBrush } from './brush'
import { createCanvas } from './canvas'
import { addImageDropListener } from './dom'
import { createEraser, PainterEraser } from './eraser'
import { createEmitter } from './event'
import { PainterHistory } from './features/history'
import { importImagePixels } from './import'
import { PainterPointerInput } from './input'
import { Keyboard } from './keyboard'
import { EditableLayer } from './layers'
import { statement } from './statement'

import { PainterStrokeRecording } from './stroke-recording'
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
  brushPresets?: readonly BrushPreset[]
  brushEngines?: readonly BrushEngineRegistration[]
  /**
   * Identifies the document namespace carried by committed-stroke events.
   * Activity painters must provide the complete session/epoch/round fence.
   */
  strokeEventScope?: PainterStrokeEventScope

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

function assertStrokeEventScope(scope: PainterStrokeEventScope | undefined): void {
  if (!scope || scope.documentScope === 'room-main')
    return
  if (!scope.sessionId || !scope.roundId || !Number.isSafeInteger(scope.activityEpoch) || scope.activityEpoch! < 1)
    throw new TypeError('Activity stroke events require sessionId, activityEpoch, and roundId.')
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
  dirty: boolean
}

export interface CreatePainterDocumentOptions {
  id?: string
  name?: string
  width: number
  height: number
  defaultLayerLabel?: string
  activate?: boolean
}

export type PainterExtractCanvasType = 'image' | 'base64' | 'canvas' | 'pixels'
export type PainterExtractCanvasMode = 'preview' | 'content'

export interface PainterExtractCanvasOptions {
  /**
   * `preview` exports the visible board, including paper/background.
   * `content` exports only the active document layer composite, preserving
   * transparent empty pixels.
   *
   * @default 'preview'
   */
  mode?: PainterExtractCanvasMode
}

export interface PainterViewportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PainterViewportSnapshot {
  x: number
  y: number
  scale: number
  viewWidth: number
  viewHeight: number
  documentWidth: number
  documentHeight: number
  visibleRect: PainterViewportRect
}

export interface ExportPainterProjectOptions {
  metadata?: SaierProjectMetadata
}

export interface ImportPainterProjectOptions {
  id?: string
  name?: string
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
  dirty: boolean
  document: RasterDocument
  surface: SurfaceBackend
  undoManager: UndoManager
  history: PainterHistory
  layersContainer: Container
  boundingBoxes: Container
  transformLayers: Map<string, TransformLayerRecord>
  surfaceLayerIds: Set<string>
  maskSurfaceIds: Set<string>
  layerTreeSignature: string
  viewport: PainterViewportState
  removeDocumentListener: () => void
}

interface TransformLayerRecord {
  layerId: string
  overlay: EditableLayer
  pixelRect: DirtyRect
  pixels: Uint8Array
  sourceWidth: number
  sourceHeight: number
}

interface ActiveTransformSession {
  documentId: string
  layerId: string
  before: LayerTransform
}

export interface PainterTransformSnapshot {
  layerId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number
  aspectRatioLocked: boolean
}

export interface SetPainterTransformValues {
  x?: number
  y?: number
  width?: number
  height?: number
  /** Rotation in degrees. */
  rotation?: number
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
  brushEngineRegistry: BrushEngineRegistry = createDefaultBrushEngineRegistry()
  touchGestureRouter!: TouchGestureRouter
  pointerInput?: PainterPointerInput
  inputPointerSource: PainterPointerSource = 'pixi'
  inputDiagnostics = false
  store!: PainterStore
  strokeRecording = new PainterStrokeRecording(this)

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
  private selectedTransformLayerId: string | null = null
  private activeTransformSession: ActiveTransformSession | null = null

  constructor(options: PainterOptions) {
    assertStrokeEventScope(options.strokeEventScope)
    this.options = options
    const { debug = false } = options

    // v8: `Application` is async-init. The constructor only constructs the
    // instance; everything that needs the renderer / stage moves into `init()`.
    this.app = new Application()

    if (debug)
      this.debug = debug

    for (const engine of options.brushEngines ?? [])
      this.brushEngineRegistry.register(engine)
    for (const preset of options.brushPresets ?? [])
      this.brushRegistry.register(preset)
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
      this.emitViewportChange()
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
      pinchZoomSensitivity: this.options.input?.pinchZoomSensitivity,
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
    this.emitViewportChange()
  }

  zoomViewportAt(point: ViewportPoint, scaleFactor: number): void {
    const board = this.board.container
    const scale = Math.max(board.scale.x * scaleFactor, this.board.minScale)
    const docX = (point.x - board.position.x) / board.scale.x
    const docY = (point.y - board.position.y) / board.scale.y
    board.position.set(point.x - docX * scale, point.y - docY * scale)
    this.boundingBoxes.position.set(board.position.x, board.position.y)
    this.canvas.scaleTo(scale)
    this.emitViewportChange()
  }

  resetViewport(): void {
    const { width, height } = this.viewportViewSize()
    this.setViewportTransform({
      x: width / 2,
      y: height / 2,
      scale: 1,
    })
  }

  getViewportSnapshot(): PainterViewportSnapshot {
    const board = this.board.container
    const { width: viewWidth, height: viewHeight } = this.viewportViewSize()
    const documentWidth = this.surface.width
    const documentHeight = this.surface.height
    const scale = board.scale.x || 1
    const left = (0 - board.position.x) / scale + documentWidth / 2
    const top = (0 - board.position.y) / scale + documentHeight / 2
    const right = (viewWidth - board.position.x) / scale + documentWidth / 2
    const bottom = (viewHeight - board.position.y) / scale + documentHeight / 2
    const x = clamp(left, 0, documentWidth)
    const y = clamp(top, 0, documentHeight)
    const clampedRight = clamp(right, 0, documentWidth)
    const clampedBottom = clamp(bottom, 0, documentHeight)

    return {
      x: board.position.x,
      y: board.position.y,
      scale,
      viewWidth,
      viewHeight,
      documentWidth,
      documentHeight,
      visibleRect: {
        x,
        y,
        width: Math.max(0, clampedRight - x),
        height: Math.max(0, clampedBottom - y),
      },
    }
  }

  setViewportCenter(point: ViewportPoint): void {
    const snapshot = this.getViewportSnapshot()
    const scale = snapshot.scale || 1
    const visibleWidth = snapshot.viewWidth / scale
    const visibleHeight = snapshot.viewHeight / scale
    const centerX = clampViewportCenter(point.x, snapshot.documentWidth, visibleWidth)
    const centerY = clampViewportCenter(point.y, snapshot.documentHeight, visibleHeight)

    this.setViewportTransform({
      x: snapshot.viewWidth / 2 - (centerX - snapshot.documentWidth / 2) * scale,
      y: snapshot.viewHeight / 2 - (centerY - snapshot.documentHeight / 2) * scale,
      scale,
    })
  }

  async extractDocumentThumbnail(maxSize = 192): Promise<string> {
    const session = this.requireActiveSession()
    const width = Math.max(1, Math.round(session.width))
    const height = Math.max(1, Math.round(session.height))
    const scale = Math.min(maxSize / width, maxSize / height, 1)
    const thumbWidth = Math.max(1, Math.round(width * scale))
    const thumbHeight = Math.max(1, Math.round(height * scale))
    const canvas = await this.extractCanvas('canvas', { mode: 'content' }) as HTMLCanvasElement
    const thumb = document.createElement('canvas')
    thumb.width = thumbWidth
    thumb.height = thumbHeight
    const context = thumb.getContext('2d')
    if (context) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, thumbWidth, thumbHeight)
      context.drawImage(canvas as unknown as CanvasImageSource, 0, 0, thumbWidth, thumbHeight)
    }
    return thumb.toDataURL('image/png')
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
      history: this.history,
      tool: this.tool,
      brushPresets: this.brushRegistry.list(),
      brushEngineRegistry: this.brushEngineRegistry,
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

  isDocumentDirty(id?: string): boolean {
    return this.resolveDocumentSession(id).dirty
  }

  hasUnsavedChanges(): boolean {
    return this.documentOrder.some((id) => {
      const session = this.documentSessions.get(id)
      return Boolean(session?.dirty)
    })
  }

  markDocumentDirty(id?: string): void {
    const session = this.resolveDocumentSession(id)
    if (session.dirty)
      return
    session.dirty = true
    this.emitDocumentsChange()
  }

  markDocumentSaved(id?: string): void {
    const session = this.resolveDocumentSession(id)
    if (!session.dirty)
      return
    session.dirty = false
    this.emitDocumentsChange()
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

    this.confirmTransform()
    this.cancelActiveStroke()
    if (current) {
      this.saveViewport(current)
      current.layersContainer.visible = false
      current.boundingBoxes.visible = false
    }

    this.activeDocumentId = next.id
    this.selectedTransformLayerId = null
    this.activateSession(next)
    this.controller.bind({
      document: next.document,
      history: next.history,
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
    session.dirty = true
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
    this.markDocumentDirty()
    const undoManager = this.undoManager
    undoManager.record(patch)
    this.history.record({
      undo: () => {
        undoManager.undo()
        this.refreshDerivedDisplays(patch.rect)
        this.markDocumentDirty()
      },
      redo: () => {
        undoManager.redo()
        this.refreshDerivedDisplays(patch.rect)
        this.markDocumentDirty()
      },
    })
  }

  onStrokeCommitted(listener: (event: PainterStrokeCommittedEvent) => void): () => void {
    this.emitter.on('stroke:committed', listener)
    return () => this.emitter.off('stroke:committed', listener)
  }

  emitStrokeCommitted(commit: SaierStrokeCommit, patch: StrokePatch): void {
    const scope = this.options.strokeEventScope ?? { documentScope: 'room-main' as const }
    this.emitter.emit('stroke:committed', {
      ...scope,
      surfaceId: patch.layerId,
      commit,
      patch,
    })
  }

  onStrokePreview(listener: (event: PainterStrokePreviewEvent) => void): () => void {
    this.emitter.on('stroke:preview', listener)
    return () => this.emitter.off('stroke:preview', listener)
  }

  emitStrokePreview(strokeId: string, surfaceId: string, previewSeq: number, point: BrushInputPoint): void {
    const scope = this.options.strokeEventScope ?? { documentScope: 'room-main' as const }
    this.emitter.emit('stroke:preview', {
      ...scope,
      point: { ...point },
      previewSeq,
      strokeId,
      surfaceId,
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
      if (context) {
        const source = canvas as HTMLCanvasElement
        const sourceWidth = Math.max(1, source.width)
        const sourceHeight = Math.max(1, source.height)
        const scale = Math.min(size / sourceWidth, size / sourceHeight)
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        const x = Math.round((size - width) / 2)
        const y = Math.round((size - height) / 2)
        context.clearRect(0, 0, size, size)
        context.drawImage(source, 0, 0, sourceWidth, sourceHeight, x, y, width, height)
      }
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
  } = {}): Promise<void> {
    const session = this.requireActiveSession()
    const imported = await importImagePixels(src, {
      maxWidth: session.width,
      maxHeight: session.height,
    })
    if (this.documentSessions.get(session.id) !== session)
      throw new Error(`Cannot import image into closed document: ${session.id}`)

    const pixelRect = centeredImageRect(session, imported.width, imported.height)
    const anchorX = pixelRect.x + pixelRect.width / 2
    const anchorY = pixelRect.y + pixelRect.height / 2
    const transform = createLayerTransform({
      x: anchorX,
      y: anchorY,
      anchorX,
      anchorY,
    })
    const label = `Image ${++EditableLayer.order}`
    const rasterLayer = session.document.addLayer({ label, transform })
    const record = this.createTransformLayerRecord(session, {
      layerId: rasterLayer.id,
      pixelRect,
      pixels: imported.pixels,
      sourceWidth: imported.width,
      sourceHeight: imported.height,
    })
    this.writeLayerPixels(session, record)
    this.attachTransformLayer(session, record)
    this.recordTransformLayerPresence(session, record, rasterLayer)

    this.markDocumentDirty(session.id)

    if ((options.autoToggleSelection ?? true) && this.activeDocumentId === session.id) {
      this.useTool('selection')
      this.selectTransformLayer(record.layerId, session.id)
    }
  }

  getTransformSelection(): PainterTransformSnapshot | null {
    const session = this.requireActiveSession()
    const layerId = this.selectedTransformLayerId
    if (!layerId)
      return null
    const record = session.transformLayers.get(layerId)
    const layer = session.document.getLayer(layerId)
    if (!record || !layer?.transform)
      return null

    return {
      layerId,
      x: layer.transform.x,
      y: layer.transform.y,
      width: Math.abs(layer.transform.scaleX) * record.sourceWidth,
      height: Math.abs(layer.transform.scaleY) * record.sourceHeight,
      rotation: layer.transform.rotation * 180 / Math.PI,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      aspectRatioLocked: record.overlay.aspectRatioLocked,
    }
  }

  setTransformSelectionValues(values: SetPainterTransformValues): void {
    const selection = this.requireTransformSelection()
    if (!selection)
      return
    const { session, record, layer } = selection
    this.beginTransform(layer.id, session.id)

    const current = layer.transform!
    const next = { ...current }
    if (Number.isFinite(values.x))
      next.x = values.x!
    if (Number.isFinite(values.y))
      next.y = values.y!
    if (Number.isFinite(values.rotation))
      next.rotation = values.rotation! * Math.PI / 180

    const currentWidth = Math.max(1, Math.abs(current.scaleX) * record.sourceWidth)
    const currentHeight = Math.max(1, Math.abs(current.scaleY) * record.sourceHeight)
    const hasWidth = Number.isFinite(values.width) && values.width! > 0
    const hasHeight = Number.isFinite(values.height) && values.height! > 0
    if (hasWidth) {
      const width = Math.max(1, values.width!)
      next.scaleX = scaleSign(current.scaleX) * width / record.sourceWidth
      if (record.overlay.aspectRatioLocked && !hasHeight)
        next.scaleY = current.scaleY * (width / currentWidth)
    }
    if (hasHeight) {
      const height = Math.max(1, values.height!)
      next.scaleY = scaleSign(current.scaleY) * height / record.sourceHeight
      if (record.overlay.aspectRatioLocked && !hasWidth)
        next.scaleX = current.scaleX * (height / currentHeight)
    }

    session.document.setTransform(layer.id, next)
    this.markDocumentDirty(session.id)
    this.emitTransformChange()
  }

  setTransformAspectRatioLocked(locked: boolean): void {
    const selection = this.requireTransformSelection()
    if (!selection)
      return
    selection.record.overlay.aspectRatioLocked = locked
    this.emitTransformChange()
  }

  flipTransformSelection(axis: 'horizontal' | 'vertical'): void {
    const selection = this.requireTransformSelection()
    if (!selection)
      return
    const transform = { ...selection.layer.transform! }
    if (axis === 'horizontal')
      transform.scaleX *= -1
    else
      transform.scaleY *= -1
    this.beginTransform(selection.layer.id, selection.session.id)
    selection.session.document.setTransform(selection.layer.id, transform)
    this.markDocumentDirty(selection.session.id)
    this.emitTransformChange()
  }

  nudgeTransformSelection(dx: number, dy: number): void {
    const selection = this.requireTransformSelection()
    if (!selection || (!dx && !dy))
      return
    const transform = {
      ...selection.layer.transform!,
      x: selection.layer.transform!.x + dx,
      y: selection.layer.transform!.y + dy,
    }
    this.beginTransform(selection.layer.id, selection.session.id)
    selection.session.document.setTransform(selection.layer.id, transform)
    this.markDocumentDirty(selection.session.id)
    this.emitTransformChange()
  }

  confirmTransform(): void {
    const transaction = this.activeTransformSession
    if (!transaction)
      return
    this.activeTransformSession = null

    const session = this.documentSessions.get(transaction.documentId)
    const after = session?.document.getLayer(transaction.layerId)?.transform
    if (!session || !after || sameLayerTransform(transaction.before, after)) {
      this.emitTransformChange()
      return
    }

    const before = { ...transaction.before }
    const committed = { ...after }
    session.history.record({
      undo: () => {
        session.document.setTransform(transaction.layerId, before)
        this.markDocumentDirty(session.id)
        this.emitTransformChange()
      },
      redo: () => {
        session.document.setTransform(transaction.layerId, committed)
        this.markDocumentDirty(session.id)
        this.emitTransformChange()
      },
    })
    this.emitTransformChange()
  }

  cancelTransform(): void {
    const transaction = this.activeTransformSession
    if (!transaction)
      return
    this.activeTransformSession = null
    const session = this.documentSessions.get(transaction.documentId)
    if (!session?.document.getLayer(transaction.layerId))
      return
    session.document.setTransform(transaction.layerId, transaction.before)
    this.emitTransformChange()
  }

  removeSelectedTransformLayer(): void {
    const selection = this.requireTransformSelection()
    if (!selection || selection.session.document.layers.length <= 1)
      return
    const { session, record, layer } = selection
    this.captureTransformLayerPixels(session, record)
    const snapshot = cloneRasterLayer(layer)
    this.activeTransformSession = null
    this.removeTransformLayer(session, record)
    session.history.record({
      undo: () => this.restoreTransformLayer(session, record, snapshot),
      redo: () => this.removeTransformLayer(session, record),
    })
  }

  private createTransformLayerRecord(
    session: PainterDocumentSession,
    input: Omit<TransformLayerRecord, 'overlay'>,
  ): TransformLayerRecord {
    const overlay = new EditableLayer(this, {
      layerId: input.layerId,
      bounds: new Rectangle(
        -input.sourceWidth / 2,
        -input.sourceHeight / 2,
        input.sourceWidth,
        input.sourceHeight,
      ),
      onSelect: () => this.selectTransformLayer(input.layerId, session.id),
      onTransformStart: () => this.beginTransform(input.layerId, session.id),
      onTransformChange: () => this.updateTransformFromOverlay(input.layerId, session.id),
      onTransformEnd: () => this.emitTransformChange(),
      onTransformConfirm: () => this.confirmTransform(),
    })
    const record = { ...input, overlay }
    session.transformLayers.set(input.layerId, record)
    return record
  }

  private attachTransformLayer(session: PainterDocumentSession, record: TransformLayerRecord): void {
    if (!record.overlay.parent)
      session.boundingBoxes.addChild(record.overlay)
    if (!record.overlay.boundingBoxContainer.parent)
      session.boundingBoxes.addChild(record.overlay.boundingBoxContainer)
    this.syncTransformOverlay(record, session)
  }

  private writeLayerPixels(session: PainterDocumentSession, record: TransformLayerRecord): void {
    if (!session.surface.writeRegion)
      throw new Error('The active surface backend does not support image import')
    session.surface.writeRegion(record.layerId, record.pixelRect, record.pixels)
    if (isDisplayMaskCapableBackend(session.surface))
      session.surface.refreshDerivedDisplays(record.pixelRect)
    session.surface.flushUploads?.()
  }

  private captureTransformLayerPixels(session: PainterDocumentSession, record: TransformLayerRecord): void {
    if (!session.surface.readRegion)
      return
    record.pixels = session.surface.readRegion(record.layerId, record.pixelRect)
  }

  private recordTransformLayerPresence(
    session: PainterDocumentSession,
    record: TransformLayerRecord,
    layer: RasterLayer,
  ): void {
    const snapshot = cloneRasterLayer(layer)
    session.history.record({
      undo: () => this.removeTransformLayer(session, record),
      redo: () => this.restoreTransformLayer(session, record, snapshot),
    })
  }

  private removeTransformLayer(session: PainterDocumentSession, record: TransformLayerRecord): void {
    if (this.activeTransformSession?.layerId === record.layerId)
      this.activeTransformSession = null
    session.document.removeLayer(record.layerId)
    record.overlay.remove()
    if (this.activeDocumentId === session.id && this.selectedTransformLayerId === record.layerId)
      this.selectedTransformLayerId = null
    this.markDocumentDirty(session.id)
    this.emitTransformChange()
  }

  private restoreTransformLayer(
    session: PainterDocumentSession,
    record: TransformLayerRecord,
    layer: RasterLayer,
  ): void {
    if (!session.document.getLayer(layer.id)) {
      session.document.addLayer({
        id: layer.id,
        label: layer.label,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        lockAlpha: layer.lockAlpha,
        clip: layer.clip,
        transform: layer.transform,
      })
    }
    this.writeLayerPixels(session, record)
    this.attachTransformLayer(session, record)
    if (this.activeDocumentId === session.id && this.tool === 'selection')
      this.selectTransformLayer(record.layerId, session.id)
    this.markDocumentDirty(session.id)
  }

  private selectTransformLayer(layerId: string, documentId: string): void {
    const session = this.documentSessions.get(documentId)
    if (!session?.transformLayers.has(layerId))
      return
    if (this.selectedTransformLayerId !== layerId)
      this.confirmTransform()
    this.selectedTransformLayerId = layerId
    if (session.document.activeLayerId !== layerId)
      session.document.setActive(layerId)
    this.beginTransform(layerId, documentId)
    this.syncTransformLayers(layerId, session)
  }

  private beginTransform(layerId: string, documentId: string): void {
    if (this.activeTransformSession?.documentId === documentId && this.activeTransformSession.layerId === layerId)
      return
    const transform = this.documentSessions.get(documentId)?.document.getLayer(layerId)?.transform
    if (!transform)
      return
    this.activeTransformSession = { documentId, layerId, before: { ...transform } }
  }

  private updateTransformFromOverlay(layerId: string, documentId: string): void {
    const session = this.documentSessions.get(documentId)
    const record = session?.transformLayers.get(layerId)
    const layer = session?.document.getLayer(layerId)
    if (!session || !record || !layer?.transform)
      return
    const overlay = record.overlay
    session.document.setTransform(layerId, {
      ...layer.transform,
      x: overlay.position.x + session.width / 2,
      y: overlay.position.y + session.height / 2,
      scaleX: overlay.scale.x,
      scaleY: overlay.scale.y,
      rotation: overlay.rotation,
    })
    this.markDocumentDirty(session.id)
    this.emitTransformChange()
  }

  private syncTransformLayers(activeLayerId: string | null, session: PainterDocumentSession): void {
    for (const record of session.transformLayers.values()) {
      const layer = session.document.getLayer(record.layerId)
      if (!layer) {
        record.overlay.setSelected(false)
        record.overlay.remove()
        continue
      }
      this.attachTransformLayer(session, record)
      this.syncTransformOverlay(record, session)
    }

    if (this.activeDocumentId !== session.id)
      return
    const nextSelected = activeLayerId && session.transformLayers.has(activeLayerId)
      ? activeLayerId
      : null
    if (this.selectedTransformLayerId !== nextSelected) {
      this.confirmTransform()
      this.selectedTransformLayerId = nextSelected
    }

    const show = this.tool === 'selection' && session.boundingBoxes.visible
    for (const record of session.transformLayers.values()) {
      const layer = session.document.getLayer(record.layerId)
      record.overlay.setSelected(Boolean(show && layer?.visible && record.layerId === nextSelected))
    }
    this.emitTransformChange()
  }

  private syncTransformOverlay(record: TransformLayerRecord, session: PainterDocumentSession): void {
    const transform = session.document.getLayer(record.layerId)?.transform
    if (!transform)
      return
    record.overlay.position.set(transform.x - session.width / 2, transform.y - session.height / 2)
    record.overlay.scale.set(transform.scaleX, transform.scaleY)
    record.overlay.rotation = transform.rotation
    record.overlay.updateTransformBoundingBox()
  }

  private requireTransformSelection(): {
    session: PainterDocumentSession
    record: TransformLayerRecord
    layer: RasterLayer & { transform: LayerTransform }
  } | null {
    const session = this.requireActiveSession()
    const layerId = this.selectedTransformLayerId
    if (!layerId)
      return null
    const record = session.transformLayers.get(layerId)
    const layer = session.document.getLayer(layerId)
    if (!record || !layer?.transform)
      return null
    return { session, record, layer: layer as RasterLayer & { transform: LayerTransform } }
  }

  private emitTransformChange(): void {
    this.emitter.emit('transform:change', this.getTransformSelection())
  }

  showBoundingBox() {
    const session = this.requireActiveSession()
    session.boundingBoxes.visible = true
    this.syncTransformLayers(session.document.activeLayerId, session)
  }

  hideBoundingBox() {
    const session = this.requireActiveSession()
    session.boundingBoxes.visible = false
    for (const record of session.transformLayers.values())
      record.overlay.setSelected(false)
    this.emitTransformChange()
  }

  /**
   * toggle tool
   */
  useTool(name: PainterTool) {
    if (this.tool === 'selection' && name !== 'selection')
      this.confirmTransform()
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
    this.cancelTransform()
    this.selectedTransformLayerId = null
    this.hideBoundingBox()
  }

  useImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file)
        return

      const objectUrl = URL.createObjectURL(file)
      try {
        await this.loadImage(objectUrl)
      }
      finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    input.click()
  }

  /**
   * @default
   */
  async extractCanvas(type: PainterExtractCanvasType = 'image', options: PainterExtractCanvasOptions = {}) {
    const { app } = this
    const { restore, target } = this.prepareExtractCanvas(options)

    try {
      if (type === 'image')
        return await app.renderer.extract.image(target)
      else if (type === 'base64')
        return await app.renderer.extract.base64(target)
      else if (type === 'canvas')
        return await app.renderer.extract.canvas(target)
      else if (type === 'pixels')
        return app.renderer.extract.pixels(target)
      else
        throw new Error(`unknown type: ${type}`)
    }
    finally {
      restore()
    }
  }

  exportProject(options: ExportPainterProjectOptions = {}): SaierProjectFile {
    const session = this.requireActiveSession()
    const surface = requireTiledSurfaceAccess(session.surface)
    this.flushSurfaceUploads()

    return serializeSaierProject({
      document: session.document,
      resolveSurface: id => tryGetSurface(surface, id),
      metadata: {
        name: session.name,
        documentId: session.id,
        ...options.metadata,
      },
    })
  }

  importProject(project: SaierProjectFile, options: ImportPainterProjectOptions = {}): PainterDocumentState {
    const restored = deserializeSaierProject(project)
    const id = options.id ?? this.nextDocumentId()
    if (this.documentSessions.has(id))
      throw new Error(`Document id already exists: ${id}`)

    this.cancelActiveStroke()
    const session = this.createDocumentSession({
      id,
      name: options.name?.trim() || projectName(restored.metadata, this.documentOrder.length + 1),
      width: restored.document.width,
      height: restored.document.height,
      document: restored.document,
    })
    const surface = requireTiledSurfaceAccess(session.surface)

    for (const [surfaceId, source] of restored.surfaces) {
      const target = surface.getSurface(surfaceId)
      target.clear()
      for (const tile of source.allocatedTiles) {
        if (!tile.hasVisiblePixels())
          continue
        const rect = source.tileRect(tile.tileX, tile.tileY)
        target.writeRegion(rect, source.readRegion(rect))
      }
    }

    for (const layer of restored.document.layers) {
      if (!layer.transform)
        continue
      const source = restored.surfaces.get(layer.id)
      const pixelRect = source ? visiblePixelBounds(source) : null
      if (!source || !pixelRect)
        continue
      const record = this.createTransformLayerRecord(session, {
        layerId: layer.id,
        pixelRect,
        pixels: new Uint8Array(source.readRegion(pixelRect)),
        sourceWidth: pixelRect.width,
        sourceHeight: pixelRect.height,
      })
      this.attachTransformLayer(session, record)
    }

    if (isDisplayMaskCapableBackend(session.surface))
      session.surface.refreshDerivedDisplays({ x: 0, y: 0, width: session.width, height: session.height })
    session.surface.flushUploads?.()

    this.documentSessions.set(session.id, session)
    this.documentOrder.push(session.id)

    if (options.activate ?? true)
      this.switchDocument(session.id)
    else
      session.layersContainer.visible = false

    this.emitDocumentsChange()
    return this.toDocumentState(session)
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
      dirty: true,
    })
    replacement.viewport = { ...current.viewport }
    this.destroySession(current)
    this.documentSessions.set(replacement.id, replacement)
    this.activeDocumentId = replacement.id
    this.activateSession(replacement)
    this.controller.bind({
      document: replacement.document,
      history: replacement.history,
    })
    this.useTool(this.tool as PainterTool)
    this.emitter.emit('canvas:clear')
    this.emitActiveDocumentChange(replacement)
  }

  destroy() {
    this.removeEventListeners()
    this.keyboard.destroy()
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
    const viewport = this.getViewportSnapshot()
    this.zoomViewportAt({
      x: viewport.viewWidth / 2,
      y: viewport.viewHeight / 2,
    }, 1.1)
  }

  zoomOut() {
    const viewport = this.getViewportSnapshot()
    this.zoomViewportAt({
      x: viewport.viewWidth / 2,
      y: viewport.viewHeight / 2,
    }, 0.9)
  }

  // 缩小画笔尺寸
  brushSizeDown() {
    this.brush.sizeDown()
  }

  brushSizeUp() {
    this.brush.sizeUp()
  }

  private createDocumentSession(options: Required<Pick<CreatePainterDocumentOptions, 'id' | 'name' | 'width' | 'height'>> & Pick<CreatePainterDocumentOptions, 'defaultLayerLabel'> & {
    dirty?: boolean
    document?: RasterDocument
  }): PainterDocumentSession {
    const layersContainer = new Container()
    layersContainer.label = `${options.id}:layers`
    const boundingBoxes = new Container()
    boundingBoxes.label = `${options.id}:boundingBoxes`

    this.canvas.documentsContainer.addChild(layersContainer)
    this.boundingBoxes.addChild(boundingBoxes)

    const document = options.document ?? new RasterDocument({ width: options.width, height: options.height })
    const surface = this.createSurfaceBackend(options.width, options.height, layersContainer)
    const undoManager = new UndoManager({ backend: surface })
    const history = new PainterHistory(this)
    const session: PainterDocumentSession = {
      id: options.id,
      name: options.name,
      width: options.width,
      height: options.height,
      dirty: options.dirty ?? false,
      document,
      surface,
      undoManager,
      history,
      layersContainer,
      boundingBoxes,
      transformLayers: new Map(),
      surfaceLayerIds: new Set(),
      maskSurfaceIds: new Set(),
      layerTreeSignature: '',
      viewport: this.defaultViewport(),
      removeDocumentListener: () => {},
    }
    const handleLayersChange = (event: DocumentLayersChangeEvent) => {
      this.syncSurfaceLayers(event.effectiveLayers, session)
      this.syncTransformLayers(event.activeLayerId, session)
      const nextSignature = layerTreeSignature(event.layerTree)
      if (session.layerTreeSignature && session.layerTreeSignature !== nextSignature)
        this.markDocumentDirty(session.id)
      session.layerTreeSignature = nextSignature
    }
    document.on('layers:change', handleLayersChange)
    session.removeDocumentListener = () => {
      document.off('layers:change', handleLayersChange)
    }

    if (options.document) {
      this.syncSurfaceLayers(document.effectiveLayers, session)
      session.layerTreeSignature = layerTreeSignature(document.layerTree)
    }
    else {
      const layer = document.addLayer({
        id: 'layer-1',
        label: options.defaultLayerLabel ?? 'Layer 1',
      })
      this.syncSurfaceLayers([layer], session)
      session.layerTreeSignature = layerTreeSignature(document.layerTree)
    }
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
    for (const record of session.transformLayers.values()) {
      record.overlay.remove()
      record.overlay.destroy()
    }
    session.transformLayers.clear()
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

  private resolveDocumentSession(id?: string): PainterDocumentSession {
    if (id) {
      const session = this.documentSessions.get(id)
      if (!session)
        throw new Error(`Unknown document: ${id}`)
      return session
    }

    return this.requireActiveSession()
  }

  private prepareExtractCanvas(options: PainterExtractCanvasOptions) {
    if (options.mode !== 'content') {
      return {
        target: this.board.container,
        restore: () => {},
      }
    }

    const session = this.requireActiveSession()
    this.flushSurfaceUploads()
    const exportContainer = new Container()
    exportContainer.label = `${session.id}:content-export`
    const originalParent = session.layersContainer.parent
    const originalIndex = originalParent?.getChildIndex(session.layersContainer) ?? -1
    const originalPosition = session.layersContainer.position.clone()
    const originalVisible = session.layersContainer.visible

    session.layersContainer.position.set(session.width / 2, session.height / 2)
    session.layersContainer.visible = true
    exportContainer.addChild(session.layersContainer)

    return {
      target: {
        target: exportContainer,
        frame: new Rectangle(0, 0, session.width, session.height),
      },
      restore: () => {
        session.layersContainer.position.copyFrom(originalPosition)
        session.layersContainer.visible = originalVisible
        exportContainer.removeChild(session.layersContainer)
        if (originalParent) {
          const index = originalIndex >= 0
            ? Math.min(originalIndex, originalParent.children.length)
            : originalParent.children.length
          originalParent.addChildAt(session.layersContainer, index)
        }
        exportContainer.destroy()
      },
    }
  }

  private toDocumentState(session: PainterDocumentSession): PainterDocumentState {
    return {
      id: session.id,
      name: session.name,
      width: session.width,
      height: session.height,
      active: session.id === this.activeDocumentId,
      dirty: session.dirty,
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
    this.setViewportTransform(session.viewport)
  }

  private setViewportTransform(viewport: PainterViewportState): void {
    this.board.container.position.set(viewport.x, viewport.y)
    this.boundingBoxes.position.set(viewport.x, viewport.y)
    this.canvas.scaleTo(Math.max(viewport.scale, this.board.minScale))
    this.emitViewportChange()
  }

  private viewportViewSize(): { width: number, height: number } {
    return {
      width: this.app.canvas.width / this.app.renderer.resolution,
      height: this.app.canvas.height / this.app.renderer.resolution,
    }
  }

  private emitViewportChange(): void {
    try {
      this.saveViewport(this.requireActiveSession())
      this.emitter.emit('viewport:change', this.getViewportSnapshot())
    }
    catch {
      // The viewport can be touched during init before a document is active.
    }
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
  refreshDerivedDisplays(dirtyRect?: StrokePatch['rect']): void {
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

function centeredImageRect(
  session: Pick<PainterDocumentSession, 'width' | 'height'>,
  width: number,
  height: number,
): DirtyRect {
  return {
    x: Math.floor((session.width - width) / 2),
    y: Math.floor((session.height - height) / 2),
    width,
    height,
  }
}

function cloneRasterLayer(layer: RasterLayer): RasterLayer {
  return {
    ...layer,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
    ...(layer.mask ? { mask: { ...layer.mask } } : {}),
  }
}

function sameLayerTransform(a: LayerTransform, b: LayerTransform): boolean {
  return a.x === b.x
    && a.y === b.y
    && a.scaleX === b.scaleX
    && a.scaleY === b.scaleY
    && a.rotation === b.rotation
    && a.anchorX === b.anchorX
    && a.anchorY === b.anchorY
}

function scaleSign(value: number): -1 | 1 {
  return value < 0 ? -1 : 1
}

function visiblePixelBounds(surface: TiledSurface): DirtyRect | null {
  let left = surface.width
  let top = surface.height
  let right = 0
  let bottom = 0
  let found = false

  for (const tile of surface.allocatedTiles) {
    const data = tile.data
    if (!data)
      continue
    const origin = surface.tileToDoc(tile.tileX, tile.tileY)
    const rect = surface.tileRect(tile.tileX, tile.tileY)
    for (let localY = 0; localY < rect.height; localY++) {
      for (let localX = 0; localX < rect.width; localX++) {
        const alpha = data[(localY * tile.tileSize + localX) * 4 + 3]
        if (!alpha)
          continue
        const x = origin.x + localX
        const y = origin.y + localY
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x + 1)
        bottom = Math.max(bottom, y + 1)
        found = true
      }
    }
  }

  return found
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null
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

function clampViewportCenter(center: number, documentSize: number, visibleSize: number): number {
  if (visibleSize >= documentSize)
    return documentSize / 2
  return clamp(center, visibleSize / 2, documentSize - visibleSize / 2)
}

function clamp(value: number, min: number, max: number): number {
  if (value < min)
    return min
  if (value > max)
    return max
  return value
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
type TiledSurfaceAccessBackend = SurfaceBackend & {
  getSurface: (layerId: string) => TiledSurface
}

function isDisplayMaskCapableBackend(surface: SurfaceBackend): surface is DisplayMaskSurfaceBackend {
  const maybe = surface as Partial<DisplayMaskCapableBackend>
  return typeof maybe.hasLayer === 'function'
    && typeof maybe.createHiddenLayer === 'function'
    && typeof maybe.fillLayerOpaque === 'function'
    && typeof maybe.setLayerDisplayMask === 'function'
    && typeof maybe.refreshDerivedDisplays === 'function'
}

function requireTiledSurfaceAccess(surface: SurfaceBackend): TiledSurfaceAccessBackend {
  const maybe = surface as Partial<TiledSurfaceAccessBackend>
  if (typeof maybe.getSurface !== 'function') {
    throw new TypeError('Project save/load requires the tiled backend surface API')
  }
  return surface as TiledSurfaceAccessBackend
}

function tryGetSurface(surface: TiledSurfaceAccessBackend, id: string): TiledSurface | undefined {
  try {
    return surface.getSurface(id)
  }
  catch {
    return undefined
  }
}

function projectName(metadata: SaierProjectMetadata, fallbackIndex: number): string {
  return typeof metadata.name === 'string' && metadata.name.trim()
    ? metadata.name.trim()
    : `Canvas ${fallbackIndex}`
}

function layerTreeSignature(layerTree: LayerNode[]): string {
  return JSON.stringify(layerTree)
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
