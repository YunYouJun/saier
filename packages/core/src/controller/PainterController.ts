import type { Emitter } from 'mitt'
import type { BrushPreset, BrushPresetId, BrushPresetSummary } from '../brush'
import type { CreateLayerOptions, Document, UndoManager } from '../document'
import type { BlendMode, LayerMaskRef, RasterLayer } from '../document/RasterLayer'
import type { LayerTransform } from '../math'
import type { RGBA } from '../types'
import mitt from 'mitt'
import {
  createDefaultBrushPresetRegistry,
  DEFAULT_BRUSH_PRESET_ID,
  toBrushPresetSummary,
} from '../brush'

export type PainterTool = 'brush' | 'eraser' | (string & {})

export interface PainterBrushState {
  presetId: BrushPresetId
  /** Brush diameter in document pixels. */
  size: number
  color: RGBA
  /** Stroke opacity in `0..1`. */
  opacity: number
  spacing: number
  hardness: number
  flow: number
  presets: BrushPresetSummary[]
}

export interface PainterLayerState {
  id: string
  label: string
  visible: boolean
  /** Layer opacity in `0..1`. */
  opacity: number
  blendMode: BlendMode
  lockAlpha: boolean
  clip: boolean
  transform?: LayerTransform
  mask?: LayerMaskRef
}

export interface PainterHistoryState {
  canUndo: boolean
  canRedo: boolean
}

export interface PainterControllerState {
  tool: PainterTool
  brush: PainterBrushState
  layers: PainterLayerState[]
  activeLayerId: string | null
  history: PainterHistoryState
}

export interface PainterControllerEvents {
  'tool:change': PainterTool
  'brush:change': PainterBrushState
  'layers:change': { layers: PainterLayerState[], activeLayerId: string | null }
  'history:change': PainterHistoryState
  [key: string]: unknown
  [key: symbol]: unknown
}

export interface PainterControllerOptions {
  /** Framework-agnostic document model that owns layer state. */
  document: Document
  /** Optional stroke history source; omitted history starts as unavailable. */
  history?: UndoManager
  tool?: PainterTool
  brush?: Partial<PainterBrushState>
  brushPresets?: readonly BrushPreset[]
}

/**
 * Headless, framework-agnostic UI state surface for a painter instance.
 *
 * UI packages should mirror state exclusively through {@link getState},
 * {@link on}, and the imperative setters on this controller. They must not
 * mutate core internals (Document fields, brush state objects, or renderer
 * objects) directly; core remains the source of truth across Vue / React / DOM.
 */
export class PainterController {
  readonly brush = {
    setPreset: (presetId: BrushPresetId) => this.setBrushPreset(presetId),
    setSize: (size: number) => this.setBrushSize(size),
    setColor: (color: RGBA) => this.setBrushColor(color),
    setOpacity: (opacity: number) => this.setBrushOpacity(opacity),
    setSpacing: (spacing: number) => this.setBrushSpacing(spacing),
    setHardness: (hardness: number) => this.setBrushHardness(hardness),
    setFlow: (flow: number) => this.setBrushFlow(flow),
  }

  readonly layer = {
    add: (options?: CreateLayerOptions) => this.addLayer(options),
    remove: (id: string) => this.removeLayer(id),
    move: (id: string, toIndex: number) => this.moveLayer(id, toIndex),
    setActive: (id: string) => this.setActiveLayer(id),
    setVisible: (id: string, visible: boolean) => this.setLayerVisible(id, visible),
    setOpacity: (id: string, opacity: number) => this.setLayerOpacity(id, opacity),
    setBlendMode: (id: string, blendMode: BlendMode) => this.setLayerBlendMode(id, blendMode),
    setLabel: (id: string, label: string) => this.setLayerLabel(id, label),
    setLockAlpha: (id: string, lockAlpha: boolean) => this.setLayerLockAlpha(id, lockAlpha),
    setClip: (id: string, clip: boolean) => this.setLayerClip(id, clip),
    setTransform: (id: string, transform: LayerTransform | undefined) => this.setLayerTransform(id, transform),
    addMask: (id: string, maskId?: string) => this.addLayerMask(id, maskId),
    removeMask: (id: string) => this.removeLayerMask(id),
    setMaskEnabled: (id: string, enabled: boolean) => this.setLayerMaskEnabled(id, enabled),
  }

  private readonly document: Document
  private readonly history: UndoManager | null
  private readonly emitter: Emitter<PainterControllerEvents> = mitt<PainterControllerEvents>()
  private readonly brushPresets: BrushPreset[]

  private tool: PainterTool
  private brushState: PainterBrushState
  private layers: PainterLayerState[]
  private activeLayerId: string | null
  private historyState: PainterHistoryState

  constructor(options: PainterControllerOptions) {
    this.document = options.document
    this.history = options.history ?? null
    this.brushPresets = normalizeBrushPresets(options.brushPresets)
    this.tool = options.tool ?? 'brush'
    this.brushState = normalizeBrushState(options.brush, this.brushPresets)
    this.layers = snapshotLayers(this.document.layers)
    this.activeLayerId = this.document.activeLayerId
    this.historyState = options.history
      ? {
          canUndo: options.history.canUndo(),
          canRedo: options.history.canRedo(),
        }
      : { canUndo: false, canRedo: false }

    this.document.on('layers:change', this.handleLayersChange)
    this.history?.on('history:change', this.handleHistoryChange)
  }

  on = this.emitter.on
  off = this.emitter.off

  /**
   * Return a pure defensive snapshot suitable for framework state mirroring.
   */
  getState(): PainterControllerState {
    return {
      tool: this.tool,
      brush: cloneBrushState(this.brushState),
      layers: cloneLayerStates(this.layers),
      activeLayerId: this.activeLayerId,
      history: { ...this.historyState },
    }
  }

  setTool(tool: PainterTool): void {
    if (this.tool === tool)
      return
    this.tool = tool
    this.emitter.emit('tool:change', tool)
  }

  setActiveLayer(id: string): void {
    this.document.setActive(id)
  }

  addLayer(options?: CreateLayerOptions): PainterLayerState {
    return snapshotLayer(this.document.addLayer(options))
  }

  removeLayer(id: string): void {
    this.document.removeLayer(id)
  }

  moveLayer(id: string, toIndex: number): void {
    this.document.moveLayer(id, toIndex)
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.document.setVisible(id, visible)
  }

  setLayerOpacity(id: string, opacity: number): void {
    this.document.setOpacity(id, opacity)
  }

  setLayerBlendMode(id: string, blendMode: BlendMode): void {
    this.document.setBlendMode(id, blendMode)
  }

  setLayerLabel(id: string, label: string): void {
    this.document.setLabel(id, label)
  }

  setLayerLockAlpha(id: string, lockAlpha: boolean): void {
    this.document.setLockAlpha(id, lockAlpha)
  }

  setLayerClip(id: string, clip: boolean): void {
    this.document.setClip(id, clip)
  }

  setLayerTransform(id: string, transform: LayerTransform | undefined): void {
    this.document.setTransform(id, transform)
  }

  addLayerMask(id: string, maskId?: string): void {
    this.document.attachMask(id, maskId)
  }

  removeLayerMask(id: string): void {
    this.document.detachMask(id)
  }

  setLayerMaskEnabled(id: string, enabled: boolean): void {
    this.document.setMaskEnabled(id, enabled)
  }

  dispose(): void {
    this.document.off('layers:change', this.handleLayersChange)
    this.history?.off('history:change', this.handleHistoryChange)
  }

  private setBrushPreset(presetId: BrushPresetId): void {
    const preset = this.brushPresets.find(item => item.id === presetId)
    if (!preset)
      throw new Error(`Unknown brush preset: ${presetId}`)

    const next = {
      ...this.brushState,
      presetId,
      size: Math.max(1, preset.size),
      opacity: clamp01(preset.opacity),
      spacing: normalizeSpacing(preset.spacing),
      hardness: clamp01(preset.hardness),
      flow: normalizeFlow(preset.flow),
    }

    if (sameBrushState(this.brushState, next))
      return
    this.brushState = next
    this.emitBrushChange()
  }

  private setBrushSize(size: number): void {
    const next = Math.max(1, size)
    if (this.brushState.size === next)
      return
    this.brushState = { ...this.brushState, size: next }
    this.emitBrushChange()
  }

  private setBrushColor(color: RGBA): void {
    const next = normalizeRGBA(color)
    if (sameRGBA(this.brushState.color, next))
      return
    this.brushState = { ...this.brushState, color: next }
    this.emitBrushChange()
  }

  private setBrushOpacity(opacity: number): void {
    const next = clamp01(opacity)
    if (this.brushState.opacity === next)
      return
    this.brushState = { ...this.brushState, opacity: next }
    this.emitBrushChange()
  }

  private setBrushSpacing(spacing: number): void {
    const next = normalizeSpacing(spacing)
    if (this.brushState.spacing === next)
      return
    this.brushState = { ...this.brushState, spacing: next }
    this.emitBrushChange()
  }

  private setBrushHardness(hardness: number): void {
    const next = clamp01(hardness)
    if (this.brushState.hardness === next)
      return
    this.brushState = { ...this.brushState, hardness: next }
    this.emitBrushChange()
  }

  private setBrushFlow(flow: number): void {
    const next = normalizeFlow(flow)
    if (this.brushState.flow === next)
      return
    this.brushState = { ...this.brushState, flow: next }
    this.emitBrushChange()
  }

  private emitBrushChange(): void {
    this.emitter.emit('brush:change', cloneBrushState(this.brushState))
  }

  private handleLayersChange = (
    event: { layers: RasterLayer[], activeLayerId: string | null },
  ): void => {
    this.layers = snapshotLayers(event.layers)
    this.activeLayerId = event.activeLayerId
    this.emitter.emit('layers:change', {
      layers: cloneLayerStates(this.layers),
      activeLayerId: this.activeLayerId,
    })
  }

  private handleHistoryChange = (event: PainterHistoryState): void => {
    this.historyState = { ...event }
    this.emitter.emit('history:change', { ...this.historyState })
  }
}

function normalizeBrushState(
  brush: Partial<PainterBrushState> = {},
  presets = normalizeBrushPresets(),
): PainterBrushState {
  const preset = presets.find(item => item.id === brush.presetId)
    ?? presets.find(item => item.id === DEFAULT_BRUSH_PRESET_ID)
    ?? presets[0]!

  return {
    presetId: preset.id,
    size: Math.max(1, brush.size ?? preset.size),
    color: normalizeRGBA(brush.color ?? { r: 0, g: 0, b: 0, a: 1 }),
    opacity: clamp01(brush.opacity ?? preset.opacity),
    spacing: normalizeSpacing(brush.spacing ?? preset.spacing),
    hardness: clamp01(brush.hardness ?? preset.hardness),
    flow: normalizeFlow(brush.flow ?? preset.flow),
    presets: presets.map(toBrushPresetSummary),
  }
}

function snapshotLayers(layers: RasterLayer[]): PainterLayerState[] {
  return layers.map(snapshotLayer)
}

function snapshotLayer(layer: RasterLayer): PainterLayerState {
  return {
    id: layer.id,
    label: layer.label,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    lockAlpha: layer.lockAlpha,
    clip: layer.clip,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
    ...(layer.mask ? { mask: { ...layer.mask } } : {}),
  }
}

function cloneLayerStates(layers: PainterLayerState[]): PainterLayerState[] {
  return layers.map(layer => ({
    ...layer,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
    ...(layer.mask ? { mask: { ...layer.mask } } : {}),
  }))
}

function cloneBrushState(brush: PainterBrushState): PainterBrushState {
  return {
    presetId: brush.presetId,
    size: brush.size,
    color: { ...brush.color },
    opacity: brush.opacity,
    spacing: brush.spacing,
    hardness: brush.hardness,
    flow: brush.flow,
    presets: brush.presets.map(preset => ({ ...preset })),
  }
}

function normalizeBrushPresets(presets?: readonly BrushPreset[]): BrushPreset[] {
  return (presets?.length ? [...presets] : createDefaultBrushPresetRegistry().list())
    .map(preset => ({ ...preset }))
}

function normalizeSpacing(spacing: number): number {
  return Math.max(0.01, spacing)
}

function normalizeFlow(flow = 1): number {
  return Math.max(1, flow)
}

function sameBrushState(a: PainterBrushState, b: PainterBrushState): boolean {
  return a.presetId === b.presetId
    && a.size === b.size
    && sameRGBA(a.color, b.color)
    && a.opacity === b.opacity
    && a.spacing === b.spacing
    && a.hardness === b.hardness
    && a.flow === b.flow
}

function normalizeRGBA(color: RGBA): RGBA {
  return {
    r: clamp01(color.r),
    g: clamp01(color.g),
    b: clamp01(color.b),
    a: clamp01(color.a),
  }
}

function sameRGBA(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}
