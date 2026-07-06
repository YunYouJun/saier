import type {
  BlendMode,
  CreateLayerGroupOptions,
  CreateLayerOptions,
  LayerNodeMoveTarget,
  PainterControllerState,
  PainterLayerNodeState,
  PainterLayerState,
  PainterMemorySnapshot,
} from '@saier/core'
import type {
  CreatePainterDocumentOptions,
  Painter,
  PainterDocumentState,
  PainterInputSnapshot,
  PainterOptions,
  PainterViewportSnapshot,
} from 'saier'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { createPainter } from 'saier'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

type MaybeFactory<T> = T | (() => T)
export type PainterPaintTarget = Painter['paintTarget']

export interface UsePainterOptions extends Omit<PainterOptions, 'boardSize' | 'pixiOptions' | 'size' | 'view'> {
  boardSize?: MaybeFactory<PainterOptions['boardSize']>
  pixiOptions?: MaybeFactory<PainterOptions['pixiOptions']>
  size?: MaybeFactory<PainterOptions['size']>
  afterInit?: (painter: Painter) => Promise<void> | void
}

export interface UsePainterReturn {
  canvas: Ref<HTMLCanvasElement | undefined>
  painter: ShallowRef<Painter | undefined>
  state: ShallowRef<PainterControllerState | undefined>
  memory: ShallowRef<PainterMemorySnapshot | undefined>
  input: ShallowRef<PainterInputSnapshot | undefined>
  documents: ShallowRef<PainterDocumentState[]>
  activeDocumentId: ComputedRef<string | null>
  layers: ComputedRef<PainterLayerState[]>
  layerTree: ComputedRef<PainterLayerNodeState[]>
  activeLayerId: ComputedRef<string | null>
  layerThumbnails: ShallowRef<Record<string, string>>
  layerMaskThumbnails: ShallowRef<Record<string, string>>
  navigatorThumbnail: ShallowRef<string>
  paintTarget: ShallowRef<PainterPaintTarget>
  viewport: ShallowRef<PainterViewportSnapshot | undefined>
  layerActions: {
    add: (options?: CreateLayerOptions) => void
    addGroup: (options?: CreateLayerGroupOptions) => void
    remove: (id: string) => void
    move: (id: string, toIndex: number) => void
    moveNode: (id: string, target: LayerNodeMoveTarget) => void
    ungroup: (id: string) => void
    setActive: (id: string) => void
    setVisible: (id: string, visible: boolean) => void
    setOpacity: (id: string, opacity: number) => void
    setBlendMode: (id: string, blendMode: BlendMode) => void
    setLabel: (id: string, label: string) => void
    setLockAlpha: (id: string, lockAlpha: boolean) => void
    setClip: (id: string, clip: boolean) => void
    addMask: (id: string) => void
    removeMask: (id: string) => void
    setMaskEnabled: (id: string, enabled: boolean) => void
    setPaintTarget: (target: PainterPaintTarget) => void
    setGroupCollapsed: (id: string, collapsed: boolean) => void
  }
  documentActions: {
    create: (options: CreatePainterDocumentOptions) => void
    switch: (id: string) => void
    close: (id: string) => void
    rename: (id: string, name: string) => void
  }
  refreshLayerThumbnails: () => Promise<void>
  refreshNavigatorThumbnail: () => Promise<void>
  refreshMemory: () => Promise<void>
  navigatorActions: {
    refreshThumbnail: () => Promise<void>
    reset: () => void
    setCenter: (point: { x: number, y: number }) => void
  }
}

export function usePainter(options: UsePainterOptions = {}): UsePainterReturn {
  const canvas = ref<HTMLCanvasElement>()
  const painter = shallowRef<Painter>()
  const state = shallowRef<PainterControllerState>()
  const memory = shallowRef<PainterMemorySnapshot>()
  const input = shallowRef<PainterInputSnapshot>()
  const documents = shallowRef<PainterDocumentState[]>([])
  const layerThumbnails = shallowRef<Record<string, string>>({})
  const layerMaskThumbnails = shallowRef<Record<string, string>>({})
  const navigatorThumbnail = shallowRef('')
  const paintTarget = shallowRef<PainterPaintTarget>('content')
  const viewport = shallowRef<PainterViewportSnapshot>()

  const layers = computed(() => state.value?.layers ?? [])
  const layerTree = computed(() => state.value?.layerTree ?? [])
  const activeLayerId = computed(() => state.value?.activeLayerId ?? null)
  const activeDocumentId = computed(() => documents.value.find(document => document.active)?.id ?? null)

  let removeControllerListeners: (() => void) | undefined
  let removePainterListeners: (() => void) | undefined
  let resizeObserver: ResizeObserver | undefined
  let thumbnailRun = 0
  let navigatorThumbnailRun = 0
  let navigatorThumbnailTimer: ReturnType<typeof setTimeout> | undefined
  let memoryRun = 0
  let memoryRefreshQueued = false

  function syncState(p: Painter): void {
    state.value = p.controller.getState()
    normalizePaintTarget(p)
  }

  function syncDocuments(p: Painter): void {
    documents.value = p.getDocuments()
  }

  function syncViewport(p: Painter, snapshot?: PainterViewportSnapshot): void {
    viewport.value = snapshot ?? p.getViewportSnapshot()
  }

  async function refreshLayerThumbnails(): Promise<void> {
    const p = painter.value
    const currentLayers = state.value?.layers ?? []
    if (!p || currentLayers.length === 0) {
      layerThumbnails.value = {}
      layerMaskThumbnails.value = {}
      return
    }

    const run = ++thumbnailRun
    const next: Record<string, string> = {}
    const nextMasks: Record<string, string> = {}
    await Promise.all(currentLayers.map(async (layer) => {
      try {
        next[layer.id] = await p.extractLayerThumbnail(layer.id, 40)
      }
      catch {
        next[layer.id] = layerThumbnails.value[layer.id] ?? ''
      }

      if (!layer.mask)
        return

      try {
        nextMasks[layer.mask.id] = await p.extractLayerThumbnail(layer.mask.id, 40)
      }
      catch {
        nextMasks[layer.mask.id] = layerMaskThumbnails.value[layer.mask.id] ?? ''
      }
    }))

    if (run === thumbnailRun) {
      layerThumbnails.value = next
      layerMaskThumbnails.value = nextMasks
    }
  }

  async function refreshNavigatorThumbnail(): Promise<void> {
    const p = painter.value
    if (!p) {
      navigatorThumbnail.value = ''
      return
    }

    const run = ++navigatorThumbnailRun
    try {
      const next = await p.extractDocumentThumbnail(192)
      if (run === navigatorThumbnailRun)
        navigatorThumbnail.value = next
    }
    catch {
      if (run === navigatorThumbnailRun && !navigatorThumbnail.value)
        navigatorThumbnail.value = ''
    }
  }

  async function refreshMemory(): Promise<void> {
    const p = painter.value
    if (!p) {
      memory.value = undefined
      return
    }

    const run = ++memoryRun
    const next = await p.measureMemory()
    if (run === memoryRun)
      memory.value = next
  }

  function scheduleMemoryRefresh(): void {
    if (memoryRefreshQueued)
      return

    memoryRefreshQueued = true
    Promise.resolve().then(() => {
      memoryRefreshQueued = false
      void refreshMemory()
    })
  }

  function scheduleNavigatorThumbnailRefresh(delay = 160): void {
    if (navigatorThumbnailTimer !== undefined)
      clearTimeout(navigatorThumbnailTimer)

    navigatorThumbnailTimer = setTimeout(() => {
      navigatorThumbnailTimer = undefined
      void refreshNavigatorThumbnail()
    }, delay)
  }

  function bindController(p: Painter, updateLayers: () => void): void {
    const update = () => {
      syncState(p)
    }
    const updateHistory = () => {
      update()
      scheduleMemoryRefresh()
    }

    removeControllerListeners?.()
    p.controller.on('tool:change', update)
    p.controller.on('brush:change', update)
    p.controller.on('history:change', updateHistory)
    p.controller.on('layers:change', updateLayers)

    removeControllerListeners = () => {
      p.controller.off('tool:change', update)
      p.controller.off('brush:change', update)
      p.controller.off('history:change', updateHistory)
      p.controller.off('layers:change', updateLayers)
    }
  }

  function bindPainter(p: Painter): void {
    const updateLayers = () => {
      syncState(p)
      syncDocuments(p)
      scheduleMemoryRefresh()
      void refreshLayerThumbnails()
      scheduleNavigatorThumbnailRefresh()
    }
    const handleCanvasClear = () => {
      bindController(p, updateLayers)
      updateLayers()
    }
    const updateInput = (snapshot: PainterInputSnapshot) => {
      input.value = snapshot
    }
    const updateViewport = (snapshot: PainterViewportSnapshot) => {
      syncViewport(p, snapshot)
    }
    const updateDocuments = () => {
      syncDocuments(p)
      syncState(p)
      syncViewport(p)
      layerThumbnails.value = {}
      layerMaskThumbnails.value = {}
      navigatorThumbnail.value = ''
      scheduleMemoryRefresh()
      void refreshLayerThumbnails()
      scheduleNavigatorThumbnailRefresh(0)
    }

    bindController(p, updateLayers)
    p.emitter.on('brush:up', updateLayers)
    p.emitter.on('eraser:up', updateLayers)
    p.emitter.on('canvas:clear', handleCanvasClear)
    p.emitter.on('input:pointer', updateInput)
    p.emitter.on('viewport:change', updateViewport)
    p.emitter.on('documents:change', updateDocuments)
    p.emitter.on('active-document:change', updateDocuments)

    removePainterListeners = () => {
      p.emitter.off('brush:up', updateLayers)
      p.emitter.off('eraser:up', updateLayers)
      p.emitter.off('canvas:clear', handleCanvasClear)
      p.emitter.off('input:pointer', updateInput)
      p.emitter.off('viewport:change', updateViewport)
      p.emitter.off('documents:change', updateDocuments)
      p.emitter.off('active-document:change', updateDocuments)
    }
  }

  function requirePainter(): Painter | undefined {
    return painter.value
  }

  function activeLayerCanPaintMask(): boolean {
    const id = activeLayerId.value
    if (!id)
      return false
    return Boolean(layers.value.find(layer => layer.id === id)?.mask?.enabled)
  }

  function normalizePaintTarget(p: Painter): void {
    const next = paintTarget.value === 'mask' && !activeLayerCanPaintMask()
      ? 'content'
      : paintTarget.value
    if (p.paintTarget !== next)
      p.setPaintTarget(next)
    paintTarget.value = next
  }

  function setPaintTarget(target: PainterPaintTarget): void {
    const p = requirePainter()
    if (!p)
      return

    const next = target === 'mask' && !activeLayerCanPaintMask()
      ? 'content'
      : target
    p.setPaintTarget(next)
    paintTarget.value = next
  }

  const layerActions = {
    add: (addOptions: CreateLayerOptions = {}) => {
      const p = requirePainter()
      if (!p)
        return
      p.controller.layer.add({
        ...addOptions,
        label: addOptions.label ?? `Layer ${layers.value.length + 1}`,
      })
    },
    addGroup: (addOptions: CreateLayerGroupOptions = {}) => {
      const p = requirePainter()
      if (!p)
        return
      p.controller.layer.addGroup({
        ...addOptions,
        label: addOptions.label ?? `Group ${countGroups(layerTree.value) + 1}`,
      })
    },
    remove: (id: string) => {
      const p = requirePainter()
      const node = findLayerNode(layerTree.value, id)
      if (!p || !node || layers.value.length - countRasterLayers(node) < 1)
        return
      p.controller.layer.remove(id)
    },
    move: (id: string, toIndex: number) => {
      requirePainter()?.controller.layer.move(id, toIndex)
    },
    moveNode: (id: string, target: LayerNodeMoveTarget) => {
      requirePainter()?.controller.layer.moveNode(id, target)
    },
    ungroup: (id: string) => {
      requirePainter()?.controller.layer.ungroup(id)
    },
    setActive: (id: string) => {
      requirePainter()?.controller.layer.setActive(id)
    },
    setVisible: (id: string, visible: boolean) => {
      requirePainter()?.controller.layer.setVisible(id, visible)
    },
    setOpacity: (id: string, opacity: number) => {
      requirePainter()?.controller.layer.setOpacity(id, opacity)
    },
    setBlendMode: (id: string, blendMode: BlendMode) => {
      requirePainter()?.controller.layer.setBlendMode(id, blendMode)
    },
    setLabel: (id: string, label: string) => {
      requirePainter()?.controller.layer.setLabel(id, label)
    },
    setLockAlpha: (id: string, lockAlpha: boolean) => {
      requirePainter()?.controller.layer.setLockAlpha(id, lockAlpha)
    },
    setClip: (id: string, clip: boolean) => {
      requirePainter()?.controller.layer.setClip(id, clip)
    },
    addMask: (id: string) => {
      const p = requirePainter()
      const layer = layers.value.find(item => item.id === id)
      if (!p || !layer)
        return
      p.controller.layer.setActive(id)
      p.controller.layer.addMask(id)
      p.setPaintTarget('mask')
      paintTarget.value = 'mask'
      syncState(p)
      void refreshLayerThumbnails()
    },
    removeMask: (id: string) => {
      const p = requirePainter()
      if (!p)
        return
      if (activeLayerId.value === id)
        setPaintTarget('content')
      p.controller.layer.removeMask(id)
      syncState(p)
      void refreshLayerThumbnails()
    },
    setMaskEnabled: (id: string, enabled: boolean) => {
      const p = requirePainter()
      if (!p)
        return
      if (activeLayerId.value === id && !enabled)
        setPaintTarget('content')
      p.controller.layer.setMaskEnabled(id, enabled)
      syncState(p)
      void refreshLayerThumbnails()
    },
    setPaintTarget,
    setGroupCollapsed: (id: string, collapsed: boolean) => {
      requirePainter()?.controller.layer.setGroupCollapsed(id, collapsed)
    },
  }

  const documentActions = {
    create: (createOptions: CreatePainterDocumentOptions) => {
      requirePainter()?.createDocument(createOptions)
    },
    switch: (id: string) => {
      requirePainter()?.switchDocument(id)
    },
    close: (id: string) => {
      requirePainter()?.closeDocument(id)
    },
    rename: (id: string, name: string) => {
      requirePainter()?.renameDocument(id, name)
    },
  }

  const navigatorActions = {
    refreshThumbnail: refreshNavigatorThumbnail,
    reset: () => {
      requirePainter()?.resetViewport()
    },
    setCenter: (point: { x: number, y: number }) => {
      requirePainter()?.setViewportCenter(point)
    },
  }

  onMounted(async () => {
    if (!canvas.value)
      return

    const { afterInit, boardSize, pixiOptions, size, ...painterOptions } = options
    const p = createPainter({
      ...painterOptions,
      boardSize: resolveMaybe(boardSize),
      pixiOptions: resolveMaybe(pixiOptions),
      size: resolveMaybe(size) ?? sizeFromCanvas(canvas.value),
      view: canvas.value,
    })

    await p.init()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        p.onResize()
      })
      resizeObserver.observe(canvas.value)
    }
    bindPainter(p)
    syncState(p)
    syncDocuments(p)
    syncViewport(p)
    await afterInit?.(p)
    syncState(p)
    syncDocuments(p)
    syncViewport(p)
    painter.value = p
    void refreshLayerThumbnails()
    scheduleNavigatorThumbnailRefresh(0)
    void refreshMemory()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
    removePainterListeners?.()
    removeControllerListeners?.()
    if (navigatorThumbnailTimer !== undefined) {
      clearTimeout(navigatorThumbnailTimer)
      navigatorThumbnailTimer = undefined
    }
    painter.value?.destroy()
    painter.value = undefined
    state.value = undefined
    memory.value = undefined
    input.value = undefined
    documents.value = []
    layerThumbnails.value = {}
    layerMaskThumbnails.value = {}
    navigatorThumbnail.value = ''
    paintTarget.value = 'content'
    viewport.value = undefined
  })

  return {
    canvas,
    painter,
    state,
    memory,
    input,
    documents,
    activeDocumentId,
    layers,
    layerTree,
    activeLayerId,
    layerThumbnails,
    layerMaskThumbnails,
    navigatorThumbnail,
    paintTarget,
    viewport,
    layerActions,
    documentActions,
    refreshLayerThumbnails,
    refreshNavigatorThumbnail,
    refreshMemory,
    navigatorActions,
  }
}

function resolveMaybe<T>(value: MaybeFactory<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}

function sizeFromCanvas(canvas: HTMLCanvasElement): PainterOptions['size'] | undefined {
  const box = canvas.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0)
    return undefined

  return {
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

function findLayerNode(nodes: readonly PainterLayerNodeState[], id: string): PainterLayerNodeState | undefined {
  for (const node of nodes) {
    if (node.id === id)
      return node
    if (node.type === 'group') {
      const found = findLayerNode(node.children, id)
      if (found)
        return found
    }
  }
  return undefined
}

function countRasterLayers(node: PainterLayerNodeState): number {
  if (node.type === 'raster')
    return 1
  return node.children.reduce((sum, child) => sum + countRasterLayers(child), 0)
}

function countGroups(nodes: readonly PainterLayerNodeState[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type !== 'group')
      continue
    count += 1 + countGroups(node.children)
  }
  return count
}
