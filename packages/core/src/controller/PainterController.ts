import type { Emitter } from 'mitt'
import type { BrushEngineRegistry, BrushPreset, BrushPresetId, BrushPresetSummary } from '../brush'
import type {
  CreateLayerGroupOptions,
  CreateLayerOptions,
  Document,
  DocumentLayersChangeEvent,
  LayerNode,
  LayerNodeMoveTarget,
} from '../document'
import type { BlendMode, LayerGroup, LayerMaskRef, RasterLayer } from '../document/RasterLayer'
import type { LayerTransform } from '../math'
import type { RGBA } from '../types'
import mitt from 'mitt'
import {
  clonePreset,
  createDefaultBrushEngineRegistry,
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
  /** Canvas pickup amount for future smudge / color-mixing engines, `0..1`. */
  smudge: number
  /** Brush's own color contribution when mixing sampled color, `0..1`. */
  colorAmount: number
  /** Pigment dilution / wetness, `0..1`. */
  dilution: number
  /** Smudge bucket memory / drag length, `0..1`. */
  persistence: number
  /** Wet-edge strength, `0..1`; `0` disables wet-edge behavior. */
  wetEdge: number
  /** Per-dab pigment deposit strength, `0..1`. */
  density: number
  /** Paper texture id used by later paper-grain coverage modulation. */
  paperTextureId?: string
  /** Paper texture coverage modulation strength, `0..1`. */
  paperTextureStrength: number
  presets: BrushPresetSummary[]
}

export interface RegisterBrushPresetOptions {
  select?: boolean
}

export interface CreateCustomBrushPresetOptions {
  id?: BrushPresetId
  name: string
  group?: string
  select?: boolean
}

export interface PainterLayerState {
  type: 'raster'
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

export interface PainterLayerGroupState {
  type: 'group'
  id: string
  label: string
  visible: boolean
  collapsed: boolean
  children: PainterLayerNodeState[]
}

export type PainterLayerNodeState = PainterLayerState | PainterLayerGroupState

export interface PainterHistoryState {
  canUndo: boolean
  canRedo: boolean
}

export interface PainterControllerState {
  tool: PainterTool
  brush: PainterBrushState
  layers: PainterLayerState[]
  layerTree: PainterLayerNodeState[]
  activeLayerId: string | null
  history: PainterHistoryState
}

export interface PainterControllerEvents {
  'tool:change': PainterTool
  'brush:change': PainterBrushState
  'layers:change': { layers: PainterLayerState[], layerTree: PainterLayerNodeState[], activeLayerId: string | null }
  'history:change': PainterHistoryState
  [key: string]: unknown
  [key: symbol]: unknown
}

export interface PainterControllerOptions {
  /** Framework-agnostic document model that owns layer state. */
  document: Document
  /** Optional stroke history source; omitted history starts as unavailable. */
  history?: PainterHistorySource
  tool?: PainterTool
  brush?: Partial<PainterBrushState>
  brushPresets?: readonly BrushPreset[]
  brushEngineRegistry?: BrushEngineRegistry
}

export interface PainterControllerBinding {
  /** Framework-agnostic document model that owns layer state. */
  document: Document
  /** Optional stroke history source; omitted history starts as unavailable. */
  history?: PainterHistorySource
}

/** Minimal history surface consumed by framework-facing controller state. */
export interface PainterHistorySource {
  canUndo: () => boolean
  canRedo: () => boolean
  on: (type: 'history:change', handler: (state: PainterHistoryState) => void) => void
  off: (type: 'history:change', handler: (state: PainterHistoryState) => void) => void
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
    setSmudge: (smudge: number) => this.setBrushSmudge(smudge),
    setColorAmount: (colorAmount: number) => this.setBrushColorAmount(colorAmount),
    setDilution: (dilution: number) => this.setBrushDilution(dilution),
    setPersistence: (persistence: number) => this.setBrushPersistence(persistence),
    setWetEdge: (wetEdge: number) => this.setBrushWetEdge(wetEdge),
    setDensity: (density: number) => this.setBrushDensity(density),
    setPaperTextureId: (paperTextureId: string | undefined) => this.setBrushPaperTextureId(paperTextureId),
    setPaperTextureStrength: (paperTextureStrength: number) => this.setBrushPaperTextureStrength(paperTextureStrength),
    registerPreset: (preset: BrushPreset, options?: RegisterBrushPresetOptions) => this.registerBrushPreset(preset, options),
    createCustomPreset: (options: CreateCustomBrushPresetOptions) => this.createCustomBrushPreset(options),
    removePreset: (id: BrushPresetId) => this.removeBrushPreset(id),
    listPresets: () => this.listBrushPresets(),
  }

  readonly layer = {
    add: (options?: CreateLayerOptions) => this.addLayer(options),
    addGroup: (options?: CreateLayerGroupOptions) => this.addLayerGroup(options),
    remove: (id: string) => this.removeLayer(id),
    move: (id: string, toIndex: number) => this.moveLayer(id, toIndex),
    moveNode: (id: string, target: LayerNodeMoveTarget) => this.moveLayerNode(id, target),
    ungroup: (id: string) => this.ungroupLayer(id),
    setActive: (id: string) => this.setActiveLayer(id),
    setVisible: (id: string, visible: boolean) => this.setLayerVisible(id, visible),
    setOpacity: (id: string, opacity: number) => this.setLayerOpacity(id, opacity),
    setBlendMode: (id: string, blendMode: BlendMode) => this.setLayerBlendMode(id, blendMode),
    setLabel: (id: string, label: string) => this.setLayerLabel(id, label),
    setLockAlpha: (id: string, lockAlpha: boolean) => this.setLayerLockAlpha(id, lockAlpha),
    setClip: (id: string, clip: boolean) => this.setLayerClip(id, clip),
    setGroupCollapsed: (id: string, collapsed: boolean) => this.setLayerGroupCollapsed(id, collapsed),
    setTransform: (id: string, transform: LayerTransform | undefined) => this.setLayerTransform(id, transform),
    addMask: (id: string, maskId?: string) => this.addLayerMask(id, maskId),
    removeMask: (id: string) => this.removeLayerMask(id),
    setMaskEnabled: (id: string, enabled: boolean) => this.setLayerMaskEnabled(id, enabled),
  }

  private document: Document
  private history: PainterHistorySource | null
  private readonly emitter: Emitter<PainterControllerEvents> = mitt<PainterControllerEvents>()
  private readonly brushPresets: BrushPreset[]
  private readonly brushEngineRegistry: BrushEngineRegistry

  private tool: PainterTool
  private brushState: PainterBrushState
  private layers: PainterLayerState[]
  private layerTree: PainterLayerNodeState[]
  private activeLayerId: string | null
  private historyState: PainterHistoryState

  constructor(options: PainterControllerOptions) {
    this.document = options.document
    this.history = options.history ?? null
    this.brushPresets = normalizeBrushPresets(options.brushPresets)
    this.brushEngineRegistry = options.brushEngineRegistry ?? createDefaultBrushEngineRegistry()
    this.tool = options.tool ?? 'brush'
    this.brushState = normalizeBrushState(options.brush, this.brushPresets, this.brushEngineRegistry)
    this.layers = snapshotLayers(this.document.layers)
    this.layerTree = snapshotLayerTree(this.document.layerTree)
    this.activeLayerId = this.document.activeLayerId
    this.historyState = options.history
      ? {
          canUndo: options.history.canUndo(),
          canRedo: options.history.canRedo(),
        }
      : { canUndo: false, canRedo: false }

    this.bindSources()
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
      layerTree: cloneLayerNodeStates(this.layerTree),
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

  bind(binding: PainterControllerBinding): void {
    this.unbindSources()
    this.document = binding.document
    this.history = binding.history ?? null
    this.layers = snapshotLayers(this.document.layers)
    this.layerTree = snapshotLayerTree(this.document.layerTree)
    this.activeLayerId = this.document.activeLayerId
    this.historyState = this.history
      ? {
          canUndo: this.history.canUndo(),
          canRedo: this.history.canRedo(),
        }
      : { canUndo: false, canRedo: false }
    this.bindSources()
    this.emitter.emit('layers:change', {
      layers: cloneLayerStates(this.layers),
      layerTree: cloneLayerNodeStates(this.layerTree),
      activeLayerId: this.activeLayerId,
    })
    this.emitter.emit('history:change', { ...this.historyState })
  }

  setActiveLayer(id: string): void {
    this.document.setActive(id)
  }

  addLayer(options?: CreateLayerOptions): PainterLayerState {
    return snapshotLayer(this.document.addLayer(options))
  }

  addLayerGroup(options?: CreateLayerGroupOptions): PainterLayerGroupState {
    return snapshotLayerGroup(this.document.addGroup(options))
  }

  removeLayer(id: string): void {
    this.document.removeLayer(id)
  }

  moveLayer(id: string, toIndex: number): void {
    this.document.moveLayer(id, toIndex)
  }

  moveLayerNode(id: string, target: LayerNodeMoveTarget): void {
    this.document.moveNode(id, target)
  }

  ungroupLayer(id: string): void {
    this.document.ungroup(id)
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

  setLayerGroupCollapsed(id: string, collapsed: boolean): void {
    this.document.setGroupCollapsed(id, collapsed)
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
    this.unbindSources()
  }

  private bindSources(): void {
    this.document.on('layers:change', this.handleLayersChange)
    this.history?.on('history:change', this.handleHistoryChange)
  }

  private unbindSources(): void {
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
      smudge: normalizeSmudge(preset.smudge),
      colorAmount: normalizeColorAmount(preset.colorAmount),
      dilution: normalizeDilution(preset.dilution),
      persistence: normalizePersistence(preset.persistence),
      wetEdge: normalizeWetEdge(preset.wetEdge),
      density: normalizeDensity(preset.density),
      paperTextureId: normalizePaperTextureId(preset.paperTextureId),
      paperTextureStrength: normalizePaperTextureStrength(preset.paperTextureStrength),
    }

    if (sameBrushState(this.brushState, next))
      return
    this.brushState = next
    this.emitBrushChange()
  }

  private registerBrushPreset(preset: BrushPreset, options: RegisterBrushPresetOptions = {}): BrushPreset {
    const next = clonePreset(preset)
    const index = this.brushPresets.findIndex(item => item.id === next.id)
    if (index >= 0)
      this.brushPresets.splice(index, 1, next)
    else
      this.brushPresets.push(next)

    this.brushState = {
      ...this.brushState,
      presets: this.snapshotBrushPresetSummaries(),
    }
    if (options.select)
      this.setBrushPreset(next.id)
    else
      this.emitBrushChange()
    return clonePreset(next)
  }

  private createCustomBrushPreset(options: CreateCustomBrushPresetOptions): BrushPreset {
    const base = this.brushPresets.find(preset => preset.id === this.brushState.presetId)
      ?? this.brushPresets[0]
    if (!base)
      throw new Error('Cannot create a custom brush without an existing preset')

    const preset: BrushPreset = {
      ...clonePreset(base),
      id: options.id ?? nextCustomBrushPresetId(options.name, this.brushPresets),
      name: options.name.trim() || 'Custom Brush',
      group: options.group?.trim() || 'Custom',
      source: 'custom',
      custom: true,
      size: this.brushState.size,
      opacity: this.brushState.opacity,
      spacing: this.brushState.spacing,
      hardness: this.brushState.hardness,
      flow: this.brushState.flow,
      smudge: this.brushState.smudge,
      colorAmount: this.brushState.colorAmount,
      dilution: this.brushState.dilution,
      persistence: this.brushState.persistence,
      wetEdge: this.brushState.wetEdge,
      density: this.brushState.density,
      paperTextureId: this.brushState.paperTextureId,
      paperTextureStrength: this.brushState.paperTextureStrength,
      tags: mergeTags(base.tags, 'custom'),
    }
    return this.registerBrushPreset(preset, { select: options.select ?? true })
  }

  private removeBrushPreset(id: BrushPresetId): boolean {
    const index = this.brushPresets.findIndex(preset => preset.id === id)
    if (index < 0 || this.brushPresets.length <= 1)
      return false

    this.brushPresets.splice(index, 1)
    const activeRemoved = this.brushState.presetId === id
    this.brushState = {
      ...this.brushState,
      presets: this.snapshotBrushPresetSummaries(),
    }
    if (activeRemoved) {
      const fallback = this.brushPresets.find(preset => preset.id === DEFAULT_BRUSH_PRESET_ID)
        ?? this.brushPresets[0]
      if (fallback)
        this.setBrushPreset(fallback.id)
    }
    else {
      this.emitBrushChange()
    }
    return true
  }

  private listBrushPresets(): BrushPreset[] {
    return this.brushPresets.map(clonePreset)
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

  private setBrushSmudge(smudge: number): void {
    const next = normalizeSmudge(smudge)
    if (this.brushState.smudge === next)
      return
    this.brushState = { ...this.brushState, smudge: next }
    this.emitBrushChange()
  }

  private setBrushColorAmount(colorAmount: number): void {
    const next = normalizeColorAmount(colorAmount)
    if (this.brushState.colorAmount === next)
      return
    this.brushState = { ...this.brushState, colorAmount: next }
    this.emitBrushChange()
  }

  private setBrushDilution(dilution: number): void {
    const next = normalizeDilution(dilution)
    if (this.brushState.dilution === next)
      return
    this.brushState = { ...this.brushState, dilution: next }
    this.emitBrushChange()
  }

  private setBrushPersistence(persistence: number): void {
    const next = normalizePersistence(persistence)
    if (this.brushState.persistence === next)
      return
    this.brushState = { ...this.brushState, persistence: next }
    this.emitBrushChange()
  }

  private setBrushWetEdge(wetEdge: number): void {
    const next = normalizeWetEdge(wetEdge)
    if (this.brushState.wetEdge === next)
      return
    this.brushState = { ...this.brushState, wetEdge: next }
    this.emitBrushChange()
  }

  private setBrushDensity(density: number): void {
    const next = normalizeDensity(density)
    if (this.brushState.density === next)
      return
    this.brushState = { ...this.brushState, density: next }
    this.emitBrushChange()
  }

  private setBrushPaperTextureId(paperTextureId: string | undefined): void {
    const next = normalizePaperTextureId(paperTextureId)
    if (this.brushState.paperTextureId === next)
      return
    this.brushState = { ...this.brushState, paperTextureId: next }
    this.emitBrushChange()
  }

  private setBrushPaperTextureStrength(paperTextureStrength: number): void {
    const next = normalizePaperTextureStrength(paperTextureStrength)
    if (this.brushState.paperTextureStrength === next)
      return
    this.brushState = { ...this.brushState, paperTextureStrength: next }
    this.emitBrushChange()
  }

  private emitBrushChange(): void {
    this.emitter.emit('brush:change', cloneBrushState(this.brushState))
  }

  private snapshotBrushPresetSummaries(): BrushPresetSummary[] {
    return this.brushPresets.map(preset => toBrushPresetSummary(preset, this.brushEngineRegistry))
  }

  private handleLayersChange = (event: DocumentLayersChangeEvent): void => {
    this.layers = snapshotLayers(event.layers)
    this.layerTree = snapshotLayerTree(event.layerTree)
    this.activeLayerId = event.activeLayerId
    this.emitter.emit('layers:change', {
      layers: cloneLayerStates(this.layers),
      layerTree: cloneLayerNodeStates(this.layerTree),
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
  engineRegistry = createDefaultBrushEngineRegistry(),
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
    smudge: normalizeSmudge(brush.smudge ?? preset.smudge),
    colorAmount: normalizeColorAmount(brush.colorAmount ?? preset.colorAmount),
    dilution: normalizeDilution(brush.dilution ?? preset.dilution),
    persistence: normalizePersistence(brush.persistence ?? preset.persistence),
    wetEdge: normalizeWetEdge(brush.wetEdge ?? preset.wetEdge),
    density: normalizeDensity(brush.density ?? preset.density),
    paperTextureId: normalizePaperTextureId(brush.paperTextureId ?? preset.paperTextureId),
    paperTextureStrength: normalizePaperTextureStrength(brush.paperTextureStrength ?? preset.paperTextureStrength),
    presets: presets.map(preset => toBrushPresetSummary(preset, engineRegistry)),
  }
}

function snapshotLayers(layers: RasterLayer[]): PainterLayerState[] {
  return layers.map(snapshotLayer)
}

function snapshotLayer(layer: RasterLayer): PainterLayerState {
  return {
    type: 'raster',
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

function snapshotLayerTree(nodes: LayerNode[]): PainterLayerNodeState[] {
  return nodes.map(snapshotLayerNode)
}

function snapshotLayerNode(node: LayerNode): PainterLayerNodeState {
  if (node.type === 'raster')
    return snapshotLayer(node)
  return snapshotLayerGroup(node)
}

function snapshotLayerGroup(group: LayerGroup): PainterLayerGroupState {
  return {
    type: 'group',
    id: group.id,
    label: group.label,
    visible: group.visible,
    collapsed: group.collapsed,
    children: group.children.map(snapshotLayerNode),
  }
}

function cloneLayerStates(layers: PainterLayerState[]): PainterLayerState[] {
  return layers.map(layer => ({
    ...layer,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
    ...(layer.mask ? { mask: { ...layer.mask } } : {}),
  }))
}

function cloneLayerNodeStates(nodes: PainterLayerNodeState[]): PainterLayerNodeState[] {
  return nodes.map((node): PainterLayerNodeState => {
    if (node.type === 'raster') {
      return {
        ...node,
        ...(node.transform ? { transform: { ...node.transform } } : {}),
        ...(node.mask ? { mask: { ...node.mask } } : {}),
      }
    }

    return {
      ...node,
      children: cloneLayerNodeStates(node.children),
    }
  })
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
    smudge: brush.smudge,
    colorAmount: brush.colorAmount,
    dilution: brush.dilution,
    persistence: brush.persistence,
    wetEdge: brush.wetEdge,
    density: brush.density,
    paperTextureId: brush.paperTextureId,
    paperTextureStrength: brush.paperTextureStrength,
    presets: brush.presets.map(preset => ({
      ...preset,
      tags: preset.tags ? [...preset.tags] : undefined,
    })),
  }
}

function normalizeBrushPresets(presets?: readonly BrushPreset[]): BrushPreset[] {
  return (presets?.length ? [...presets] : createDefaultBrushPresetRegistry().list())
    .map(clonePreset)
}

function nextCustomBrushPresetId(name: string, presets: readonly BrushPreset[]): BrushPresetId {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'brush'
  const existing = new Set(presets.map(preset => preset.id))
  let index = 1
  let id: BrushPresetId = `custom-${base}`
  while (existing.has(id)) {
    index += 1
    id = `custom-${base}-${index}`
  }
  return id
}

function mergeTags(tags: string[] | undefined, tag: string): string[] {
  const out = new Set(tags ?? [])
  out.add(tag)
  return [...out]
}

function normalizeSpacing(spacing: number): number {
  return Math.max(0.01, spacing)
}

function normalizeFlow(flow = 1): number {
  return Math.max(1, flow)
}

function normalizeSmudge(smudge = 0): number {
  return clamp01(smudge)
}

function normalizeColorAmount(colorAmount = 1): number {
  return clamp01(colorAmount)
}

function normalizeDilution(dilution = 0): number {
  return clamp01(dilution)
}

function normalizePersistence(persistence = 0): number {
  return clamp01(persistence)
}

function normalizeWetEdge(wetEdge = 0): number {
  return clamp01(wetEdge)
}

function normalizeDensity(density = 1): number {
  return clamp01(density)
}

function normalizePaperTextureId(paperTextureId: string | undefined): string | undefined {
  return paperTextureId === '' ? undefined : paperTextureId
}

function normalizePaperTextureStrength(paperTextureStrength = 0): number {
  return clamp01(paperTextureStrength)
}

function sameBrushState(a: PainterBrushState, b: PainterBrushState): boolean {
  return a.presetId === b.presetId
    && a.size === b.size
    && sameRGBA(a.color, b.color)
    && a.opacity === b.opacity
    && a.spacing === b.spacing
    && a.hardness === b.hardness
    && a.flow === b.flow
    && a.smudge === b.smudge
    && a.colorAmount === b.colorAmount
    && a.dilution === b.dilution
    && a.persistence === b.persistence
    && a.wetEdge === b.wetEdge
    && a.density === b.density
    && a.paperTextureId === b.paperTextureId
    && a.paperTextureStrength === b.paperTextureStrength
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
