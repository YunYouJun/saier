import type { Emitter } from 'mitt'
import type { LayerTransform } from '../math'
import type {
  BlendMode,
  CreateLayerGroupOptions,
  CreateLayerOptions,
  LayerGroup,
  LayerNode,
  RasterLayer,
} from './RasterLayer'
import mitt from 'mitt'
import { createLayerGroup, createRasterLayer } from './RasterLayer'

export interface LayerNodeMoveTarget {
  parentId: string | null
  index: number
}

export interface DocumentLayersChangeEvent {
  /** Raster layers ordered bottom -> top, preserving each layer's own state. */
  layers: RasterLayer[]
  /** Raster layers ordered bottom -> top with ancestor group visibility applied. */
  effectiveLayers: RasterLayer[]
  /** Full layer tree ordered bottom -> top at every level. */
  layerTree: LayerNode[]
  activeLayerId: string | null
}

export interface DocumentEvents {
  /** any structural or property change to the layer stack */
  'layers:change': DocumentLayersChangeEvent
  [key: string]: unknown
  [key: symbol]: unknown
}

export interface DocumentOptions {
  width: number
  height: number
}

interface NodeLocation {
  node: LayerNode
  parent: LayerGroup | null
  siblings: LayerNode[]
  index: number
}

/**
 * The framework-agnostic painting document: a tree of raster layers and
 * pass-through groups plus the active raster layer. UI / adapters subscribe via
 * {@link on} rather than reading the Pixi scene graph (decision D7).
 *
 * Layer and group ids are generated from per-document counters (deterministic —
 * no `Math.random` / `Date.now`).
 */
export class Document {
  readonly width: number
  readonly height: number

  private readonly emitter: Emitter<DocumentEvents> = mitt<DocumentEvents>()
  private _layerTree: LayerNode[] = []
  private _activeLayerId: string | null = null
  private layerIdCounter = 0
  private groupIdCounter = 0

  constructor(options: DocumentOptions) {
    this.width = options.width
    this.height = options.height
  }

  /** Raster layers ordered bottom -> top. Returns a defensive array copy. */
  get layers(): RasterLayer[] {
    return flattenRasterLayers(this._layerTree)
  }

  /** Raster layers with ancestor group visibility applied for renderer sync. */
  get effectiveLayers(): RasterLayer[] {
    return flattenEffectiveRasterLayers(this._layerTree, true)
  }

  /** Full layer tree ordered bottom -> top. Returns a defensive deep copy. */
  get layerTree(): LayerNode[] {
    return cloneLayerNodes(this._layerTree)
  }

  get activeLayerId(): string | null {
    return this._activeLayerId
  }

  get activeLayer(): RasterLayer | null {
    return this._activeLayerId ? this.getLayer(this._activeLayerId) ?? null : null
  }

  on = this.emitter.on
  off = this.emitter.off

  getLayer(id: string): RasterLayer | undefined {
    const node = this.getNode(id)
    return node?.type === 'raster' ? node : undefined
  }

  getGroup(id: string): LayerGroup | undefined {
    const node = this.getNode(id)
    return node?.type === 'group' ? node : undefined
  }

  getNode(id: string): LayerNode | undefined {
    return findNodeLocation(this._layerTree, id)?.node
  }

  /** Add a new raster layer and make it active. */
  addLayer(options: CreateLayerOptions = {}): RasterLayer {
    const id = options.id ?? this.nextLayerId()
    if (this.getNode(id))
      throw new Error(`Layer id already exists: ${id}`)

    const layer = createRasterLayer(id, options)
    this.insertNode(layer, options.parentId ?? null, options.index)
    this._activeLayerId = id
    this.emitChange()
    return layer
  }

  /** Add a pass-through group. Groups are not paint targets. */
  addGroup(options: CreateLayerGroupOptions = {}): LayerGroup {
    const id = options.id ?? this.nextGroupId()
    if (this.getNode(id))
      throw new Error(`Layer node id already exists: ${id}`)

    const group = createLayerGroup(id, options)
    this.insertNode(group, options.parentId ?? null, options.index)
    this.emitChange()
    return group
  }

  /** Remove a raster layer or group. Removing a group recursively removes children. */
  removeLayer(id: string): void {
    const location = findNodeLocation(this._layerTree, id)
    if (!location)
      return

    const [removed] = location.siblings.splice(location.index, 1)
    if (removed && this._activeLayerId && nodeContainsRasterId(removed, this._activeLayerId))
      this._activeLayerId = this.layers[this.layers.length - 1]?.id ?? null
    this.emitChange()
  }

  /** Move a layer node to `toIndex` in the flattened raster order. */
  moveLayer(id: string, toIndex: number): void {
    const layer = this.getLayer(id)
    if (!layer)
      return

    const layers = this.layers
    const from = layers.findIndex(l => l.id === id)
    if (from === -1)
      return

    const to = Math.max(0, Math.min(layers.length - 1, toIndex))
    if (from === to)
      return

    const target = layers[to]
    if (!target)
      return

    const targetLocation = findNodeLocation(this._layerTree, target.id)
    if (!targetLocation)
      return

    this.moveNode(id, {
      parentId: targetLocation.parent?.id ?? null,
      index: to > from ? targetLocation.index + 1 : targetLocation.index,
    })
  }

  /** Move any node to a target parent/index. */
  moveNode(id: string, target: LayerNodeMoveTarget): void {
    const location = findNodeLocation(this._layerTree, id)
    if (!location)
      return

    const targetSiblings = this.resolveChildren(target.parentId)
    if (location.node.type === 'group' && target.parentId) {
      const targetParent = this.getGroup(target.parentId)
      if (targetParent && nodeContainsGroup(location.node, targetParent.id))
        throw new Error(`Cannot move group "${id}" into itself or its descendants`)
    }

    const originalSiblings = location.siblings
    const [node] = originalSiblings.splice(location.index, 1)
    if (!node)
      return

    let index = Math.max(0, Math.min(targetSiblings.length, target.index))
    if (originalSiblings === targetSiblings && location.index < index)
      index -= 1

    targetSiblings.splice(index, 0, node)
    this.emitChange()
  }

  /** Remove a group and keep its children in the group's former position. */
  ungroup(id: string): void {
    const location = findNodeLocation(this._layerTree, id)
    if (!location || location.node.type !== 'group')
      return

    location.siblings.splice(location.index, 1, ...location.node.children)
    location.node.children = []
    this.emitChange()
  }

  setActive(id: string): void {
    if (!this.getLayer(id))
      throw new Error(`Cannot activate unknown layer: ${id}`)
    if (this._activeLayerId === id)
      return
    this._activeLayerId = id
    this.emitChange()
  }

  setOpacity(id: string, opacity: number): void {
    const layer = this.getLayer(id)
    if (!layer)
      return
    const next = Math.max(0, Math.min(1, opacity))
    if (layer.opacity === next)
      return
    layer.opacity = next
    this.emitChange()
  }

  setVisible(id: string, visible: boolean): void {
    const node = this.getNode(id)
    if (!node || node.visible === visible)
      return
    node.visible = visible
    this.emitChange()
  }

  setBlendMode(id: string, blendMode: BlendMode): void {
    const layer = this.getLayer(id)
    if (!layer || layer.blendMode === blendMode)
      return
    layer.blendMode = blendMode
    this.emitChange()
  }

  setLabel(id: string, label: string): void {
    const node = this.getNode(id)
    const next = label.trim()
    if (!node || !next || node.label === next)
      return
    node.label = next
    this.emitChange()
  }

  setLockAlpha(id: string, lockAlpha: boolean): void {
    const layer = this.getLayer(id)
    if (!layer || layer.lockAlpha === lockAlpha)
      return
    layer.lockAlpha = lockAlpha
    this.emitChange()
  }

  setClip(id: string, clip: boolean): void {
    const layer = this.getLayer(id)
    if (!layer || layer.clip === clip)
      return
    layer.clip = clip
    this.emitChange()
  }

  setGroupCollapsed(id: string, collapsed: boolean): void {
    const group = this.getGroup(id)
    if (!group || group.collapsed === collapsed)
      return
    group.collapsed = collapsed
    this.emitChange()
  }

  /** Set (or clear, with `undefined`) a layer's own affine transform. */
  setTransform(id: string, transform: LayerTransform | undefined): void {
    const layer = this.getLayer(id)
    if (!layer)
      return
    if (transform)
      layer.transform = { ...transform }
    else
      delete layer.transform
    this.emitChange()
  }

  /** Attach a mask to a raster layer (no-op if one already exists). */
  attachMask(id: string, maskId = `${id}:mask`): void {
    const layer = this.getLayer(id)
    if (!layer || layer.mask)
      return
    layer.mask = { id: maskId, enabled: true }
    this.emitChange()
  }

  detachMask(id: string): void {
    const layer = this.getLayer(id)
    if (!layer || !layer.mask)
      return
    delete layer.mask
    this.emitChange()
  }

  setMaskEnabled(id: string, enabled: boolean): void {
    const layer = this.getLayer(id)
    if (!layer || !layer.mask || layer.mask.enabled === enabled)
      return
    layer.mask.enabled = enabled
    this.emitChange()
  }

  private insertNode(node: LayerNode, parentId: string | null, index: number | undefined): void {
    const siblings = this.resolveChildren(parentId)
    const nextIndex = index === undefined
      ? siblings.length
      : Math.max(0, Math.min(siblings.length, index))
    siblings.splice(nextIndex, 0, node)
  }

  private resolveChildren(parentId: string | null): LayerNode[] {
    if (!parentId)
      return this._layerTree

    const parent = this.getGroup(parentId)
    if (!parent)
      throw new Error(`Unknown layer group: ${parentId}`)
    return parent.children
  }

  private nextLayerId(): string {
    let id: string
    do {
      this.layerIdCounter += 1
      id = `layer-${this.layerIdCounter}`
    } while (this.getNode(id))
    return id
  }

  private nextGroupId(): string {
    let id: string
    do {
      this.groupIdCounter += 1
      id = `group-${this.groupIdCounter}`
    } while (this.getNode(id))
    return id
  }

  private emitChange(): void {
    this.emitter.emit('layers:change', {
      layers: this.layers,
      effectiveLayers: this.effectiveLayers,
      layerTree: this.layerTree,
      activeLayerId: this._activeLayerId,
    })
  }
}

function findNodeLocation(
  siblings: LayerNode[],
  id: string,
  parent: LayerGroup | null = null,
): NodeLocation | undefined {
  for (let index = 0; index < siblings.length; index++) {
    const node = siblings[index]!
    if (node.id === id)
      return { node, parent, siblings, index }
    if (node.type === 'group') {
      const found = findNodeLocation(node.children, id, node)
      if (found)
        return found
    }
  }
  return undefined
}

function flattenRasterLayers(nodes: readonly LayerNode[]): RasterLayer[] {
  const out: RasterLayer[] = []
  for (const node of nodes) {
    if (node.type === 'raster')
      out.push(node)
    else
      out.push(...flattenRasterLayers(node.children))
  }
  return out
}

function flattenEffectiveRasterLayers(nodes: readonly LayerNode[], parentVisible: boolean): RasterLayer[] {
  const out: RasterLayer[] = []
  for (const node of nodes) {
    if (node.type === 'raster') {
      out.push({
        ...cloneRasterLayer(node),
        visible: parentVisible && node.visible,
      })
      continue
    }

    out.push(...flattenEffectiveRasterLayers(node.children, parentVisible && node.visible))
  }
  return out
}

function cloneLayerNodes(nodes: readonly LayerNode[]): LayerNode[] {
  return nodes.map((node): LayerNode => {
    if (node.type === 'raster')
      return cloneRasterLayer(node)
    return {
      type: 'group',
      id: node.id,
      label: node.label,
      visible: node.visible,
      collapsed: node.collapsed,
      children: cloneLayerNodes(node.children),
    }
  })
}

function cloneRasterLayer(layer: RasterLayer): RasterLayer {
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

function nodeContainsRasterId(node: LayerNode, id: string): boolean {
  if (node.type === 'raster')
    return node.id === id
  return node.children.some(child => nodeContainsRasterId(child, id))
}

function nodeContainsGroup(node: LayerGroup, id: string): boolean {
  if (node.id === id)
    return true
  return node.children.some(child => child.type === 'group' && nodeContainsGroup(child, id))
}
