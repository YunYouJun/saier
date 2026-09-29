import type { Painter } from 'saier'
import type { LoadedPresetAsset } from './preset'
import type { PresetPlacement } from './preset-contract'
import type { WatermarkWorkInput } from './workfile'
import { createPainter } from 'saier'
import { fitPlacement, isMovableAsset, WATERMARK_ROLE_NAMES } from './editing'
import { compositePreset, describePreset } from './preset'
import { parsePresetPlacements } from './preset-contract'

interface WorkspaceLayer {
  id: string
  asset: LoadedPresetAsset
  placement: PresetPlacement
  sourceWidth: number
}

export interface WatermarkWorkspaceState {
  layers: { id: string, name: string, source: string, placement: PresetPlacement, movable: boolean, recolorable: boolean, frame: boolean }[]
  selectedId: string | null
  canUndo: boolean
  canRedo: boolean
  zoom: number
}

/** Saier owns layer geometry, selection and history; the preset compositor owns PSD appearance. */
export class WatermarkWorkspace {
  readonly painter: Painter
  readonly ownsPainter: boolean
  documentId = ''
  private nativeDocument!: Painter['document']
  private nativeHistory!: Painter['history']
  private readonly records = new Map<string, WorkspaceLayer>()
  private readonly source = document.createElement('canvas')
  private readonly preview = document.createElement('canvas')
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private initComplete = false
  private runtimeReady = false
  private destroyed = false
  private readonly notify: () => void
  private readonly fail: (error: unknown) => void

  constructor(view: HTMLCanvasElement, readonly input: WatermarkWorkInput, onChange: () => void, onError: (error: unknown) => void, painter?: Painter) {
    this.notify = onChange
    this.fail = onError
    this.ownsPainter = !painter
    this.painter = painter ?? createPainter({ view, boardSize: input.artwork, size: { width: view.clientWidth, height: view.clientHeight }, imageDrop: false, resolution: window.devicePixelRatio, pixiOptions: { backgroundAlpha: 0 } })
    const ratio = Math.min(1, 1440 / Math.max(input.artwork.width, input.artwork.height))
    this.source.width = this.preview.width = Math.round(input.artwork.width * ratio)
    this.source.height = this.preview.height = Math.round(input.artwork.height * ratio)
    this.source.getContext('2d')!.drawImage(input.artwork, 0, 0, this.source.width, this.source.height)
  }

  async init(): Promise<void> {
    try {
      await this.initialize()
    }
    finally {
      this.initComplete = true
      if (this.disposed && this.runtimeReady)
        this.teardown()
    }
  }

  private async initialize(): Promise<void> {
    const p = this.painter
    if (this.ownsPainter)
      await p.init()
    else
      p.createDocument({ width: this.input.artwork.width, height: this.input.artwork.height, name: `${this.input.preset.name} · 水印` })
    this.runtimeReady = true
    this.documentId = p.getActiveDocumentId()
    this.nativeDocument = p.document
    this.nativeHistory = p.history
    if (this.disposed)
      return
    // This host exposes image transforms only; prevent global brush/delete shortcuts.
    if (this.ownsPainter)
      p.keyboard.destroy()
    p.useTool('selection')
    const original = p.document.activeLayerId!
    p.document.setLabel(original, '原图（固定）')
    for (const placement of this.input.placements) {
      if (this.disposed)
        return
      const asset = this.input.preset.assets.find(a => a.id === placement.assetId)!
      let id: string
      let sourceWidth = asset.width
      if (isMovableAsset(asset)) {
        await p.loadImage(asset.source, { label: WATERMARK_ROLE_NAMES[asset.role] })
        if (this.disposed)
          return
        id = p.document.activeLayerId!
        sourceWidth = p.getTransformSelection()!.width
      }
      else {
        id = p.document.addLayer({ label: WATERMARK_ROLE_NAMES[asset.role] }).id
      }
      const record = { id, asset, sourceWidth, placement: { ...placement } }
      this.records.set(id, record)
      p.document.setOpacity(id, placement.opacity)
      this.setGeometry(record, placement)
      p.confirmTransform()
    }
    p.history.clear()
    this.select(this.records.keys().next().value ?? original)
    this.fitView()
    p.document.on('layers:change', this.changed)
    p.emitter.on('transform:change', this.changed)
    p.emitter.on('viewport:change', this.notify)
    p.history.on('history:change', this.notify)
    p.app.stage.on('pointerup', this.endGesture)
    p.app.stage.on('pointerupoutside', this.endGesture)
    p.app.stage.on('pointercancel', this.cancelGesture)
    this.renderPreview()
    this.notify()
  }

  private setGeometry(record: WorkspaceLayer, placement: PresetPlacement): void {
    const layer = this.nativeDocument.getLayer(record.id)!
    if (!layer.transform)
      return
    const width = placement.width * this.input.artwork.width
    const height = width * record.asset.height / record.asset.width
    const scale = width / record.sourceWidth
    this.nativeDocument.setTransform(record.id, {
      ...layer.transform,
      x: placement.x * this.input.artwork.width + width / 2,
      y: placement.y * this.input.artwork.height + height / 2,
      scaleX: scale,
      scaleY: scale,
      rotation: placement.rotation * Math.PI / 180,
    })
  }

  private placement(record: WorkspaceLayer): PresetPlacement {
    const layer = this.nativeDocument.getLayer(record.id)!
    const t = layer.transform
    if (!t)
      return { ...record.placement, opacity: layer.opacity }
    const width = Math.abs(t.scaleX) * record.sourceWidth
    const height = width * record.asset.height / record.asset.width
    const next = {
      ...record.placement,
      x: (t.x - width / 2) / this.input.artwork.width,
      y: (t.y - height / 2) / this.input.artwork.height,
      width: width / this.input.artwork.width,
      rotation: ((t.rotation * 180 / Math.PI + 180) % 360 + 360) % 360 - 180,
      opacity: layer.opacity,
    }
    return fitPlacement(next, record.asset, this.input.artwork, {})
  }

  getState(): WatermarkWorkspaceState {
    const p = this.painter
    return {
      layers: [...this.records.values()].map(record => ({ id: record.id, name: WATERMARK_ROLE_NAMES[record.asset.role], source: record.asset.source, placement: this.placement(record), movable: isMovableAsset(record.asset), recolorable: record.asset.recolorable, frame: record.asset.role === 'frame' })),
      selectedId: this.nativeDocument.activeLayerId,
      canUndo: this.nativeHistory.canUndo(),
      canRedo: this.nativeHistory.canRedo(),
      zoom: p.getViewportSnapshot().scale,
    }
  }

  getPlacements(): PresetPlacement[] {
    return [...this.records.values()].map(record => this.placement(record))
  }

  select(id: string): void {
    this.finishTransform()
    this.painter.controller.layer.setActive(id)
    this.painter.useTool('selection')
    this.notify()
  }

  update(id: string, patch: Partial<PresetPlacement>): void {
    const record = this.records.get(id)
    if (!record)
      return
    this.select(id)
    const before = this.placement(record)
    const after = fitPlacement(before, record.asset, this.input.artwork, patch)
    parsePresetPlacements([after], describePreset(this.input.preset), this.input.artwork)
    const apply = (value: PresetPlacement): void => {
      record.placement = { ...value }
      this.setGeometry(record, value)
      this.painter.document.setOpacity(id, value.opacity)
      this.changed()
    }
    this.painter.confirmTransform()
    if (JSON.stringify(before) === JSON.stringify(after))
      return
    apply(after)
    this.painter.history.record({ undo: () => apply(before), redo: () => apply(after) })
    this.painter.markDocumentDirty(this.documentId)
  }

  finishTransform(): void {
    if (!this.isActive())
      return
    const p = this.painter
    const id = p.document.activeLayerId
    const record = id && this.records.get(id)
    if (record && isMovableAsset(record.asset))
      this.setGeometry(record, this.placement(record))
    p.confirmTransform()
  }

  undo(): void {
    this.finishTransform()
    this.painter.history.undo()
    this.changed()
  }

  redo(): void {
    this.painter.cancelTransform()
    this.painter.history.redo()
    this.changed()
  }

  fitView(): void {
    const p = this.painter
    p.onResize()
    const view = p.options.view
    p.resetViewport()
    p.zoomViewportAt({ x: view.clientWidth / 2, y: view.clientHeight / 2 }, Math.max(0.01, Math.min(1, (view.clientWidth - 100) / this.input.artwork.width, (view.clientHeight - 100) / this.input.artwork.height)))
  }

  zoom(factor: number): void {
    const view = this.painter.options.view
    this.painter.zoomViewportAt({ x: view.clientWidth / 2, y: view.clientHeight / 2 }, factor)
  }

  /** Hit testing uses the same normalized, rotated geometry as the compositor. */
  pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.painter.tool !== 'selection')
      return
    this.painter.options.view.focus()
    const rect = this.painter.options.view.getBoundingClientRect()
    const point = this.painter.board.container.toLocal({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    const x = point.x + this.input.artwork.width / 2
    const y = point.y + this.input.artwork.height / 2
    const contains = (record: WorkspaceLayer, margin = 0): boolean => {
      const p = this.placement(record)
      const width = p.width * this.input.artwork.width
      const height = width * record.asset.height / record.asset.width
      const dx = x - (p.x * this.input.artwork.width + width / 2)
      const dy = y - (p.y * this.input.artwork.height + height / 2)
      const angle = p.rotation * Math.PI / 180
      return Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) < width / 2 + margin && Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle)) < height / 2 + margin
    }
    const active = this.records.get(this.painter.document.activeLayerId ?? '')
    // Preserve the native rotate/resize handles just outside the active bounds.
    if (active && isMovableAsset(active.asset) && contains(active, 48 / this.painter.getViewportSnapshot().scale))
      return
    const hit = [...this.records.values()].reverse().find(record => isMovableAsset(record.asset) && contains(record))
    if (hit)
      this.select(hit.id)
  }

  keydown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase()
    if ((event.metaKey || event.ctrlKey) && key === 'z') {
      event.preventDefault()
      event.shiftKey ? this.redo() : this.undo()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelGesture()
    }
    else {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
      const id = this.painter.document.activeLayerId
      const record = id && this.records.get(id)
      if (!direction || !record || !isMovableAsset(record.asset))
        return
      event.preventDefault()
      const current = this.placement(record)
      const step = event.shiftKey ? 10 : 1
      this.update(record.id, { x: current.x + direction[0]! * step / this.input.artwork.width, y: current.y + direction[1]! * step / this.input.artwork.height })
    }
  }

  exportCanvas(): HTMLCanvasElement {
    this.finishTransform()
    return compositePreset(this.input.artwork, this.input.preset, this.getPlacements(), this.input.regions)
  }

  isActive(): boolean {
    return this.documentId === this.painter.getActiveDocumentId()
  }

  /** Restore this document's procedural display after a host tab switch. */
  resume(): void {
    if (!this.isActive() || this.disposed)
      return
    this.painter.useTool('selection')
    this.renderPreview()
    this.notify()
  }

  private readonly changed = (): void => {
    if (this.disposed || !this.isActive())
      return
    this.notify()
    if (this.timer)
      clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      try {
        this.renderPreview()
      }
      catch (error) {
        this.fail(error)
      }
    }, 80)
  }

  private readonly endGesture = (): void => {
    queueMicrotask(() => {
      if (!this.disposed && this.isActive())
        this.finishTransform()
    })
  }

  private readonly cancelGesture = (): void => {
    if (!this.isActive())
      return
    this.painter.cancelTransform()
    this.changed()
  }

  private renderPreview(): void {
    if (!this.isActive())
      return
    const composed = compositePreset(this.source, this.input.preset, this.getPlacements(), this.input.regions)
    const context = this.preview.getContext('2d')!
    context.clearRect(0, 0, this.preview.width, this.preview.height)
    context.drawImage(composed, 0, 0)
    this.painter.setDocumentPreview(this.preview)
  }

  destroy(): void {
    this.disposed = true
    clearTimeout(this.timer)
    if (this.runtimeReady && (this.initComplete || !this.ownsPainter))
      this.teardown()
  }

  private teardown(): void {
    if (this.destroyed)
      return
    this.destroyed = true
    this.nativeDocument.off('layers:change', this.changed)
    this.painter.emitter.off('transform:change', this.changed)
    this.painter.emitter.off('viewport:change', this.notify)
    this.nativeHistory.off('history:change', this.notify)
    this.painter.app.stage.off('pointerup', this.endGesture)
    this.painter.app.stage.off('pointerupoutside', this.endGesture)
    this.painter.app.stage.off('pointercancel', this.cancelGesture)
    if (this.isActive())
      this.painter.setDocumentPreview(null)
    if (this.ownsPainter)
      this.painter.destroy()
  }
}
