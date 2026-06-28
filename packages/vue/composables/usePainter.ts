import type {
  BlendMode,
  PainterControllerState,
  PainterLayerState,
  PainterMemorySnapshot,
} from '@saier/core'
import type { Painter, PainterOptions } from 'saier'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { createPainter } from 'saier'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

type MaybeFactory<T> = T | (() => T)

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
  layers: ComputedRef<PainterLayerState[]>
  activeLayerId: ComputedRef<string | null>
  layerThumbnails: ShallowRef<Record<string, string>>
  layerActions: {
    add: () => void
    remove: (id: string) => void
    move: (id: string, toIndex: number) => void
    setActive: (id: string) => void
    setVisible: (id: string, visible: boolean) => void
    setOpacity: (id: string, opacity: number) => void
    setBlendMode: (id: string, blendMode: BlendMode) => void
    setLabel: (id: string, label: string) => void
  }
  refreshLayerThumbnails: () => Promise<void>
  refreshMemory: () => Promise<void>
}

export function usePainter(options: UsePainterOptions = {}): UsePainterReturn {
  const canvas = ref<HTMLCanvasElement>()
  const painter = shallowRef<Painter>()
  const state = shallowRef<PainterControllerState>()
  const memory = shallowRef<PainterMemorySnapshot>()
  const layerThumbnails = shallowRef<Record<string, string>>({})

  const layers = computed(() => state.value?.layers ?? [])
  const activeLayerId = computed(() => state.value?.activeLayerId ?? null)

  let removeControllerListeners: (() => void) | undefined
  let removePainterListeners: (() => void) | undefined
  let resizeObserver: ResizeObserver | undefined
  let thumbnailRun = 0
  let memoryRun = 0
  let memoryRefreshQueued = false

  function syncState(p: Painter): void {
    state.value = p.controller.getState()
  }

  async function refreshLayerThumbnails(): Promise<void> {
    const p = painter.value
    const currentLayers = state.value?.layers ?? []
    if (!p || currentLayers.length === 0) {
      layerThumbnails.value = {}
      return
    }

    const run = ++thumbnailRun
    const next: Record<string, string> = {}
    await Promise.all(currentLayers.map(async (layer) => {
      try {
        next[layer.id] = await p.extractLayerThumbnail(layer.id, 40)
      }
      catch {
        next[layer.id] = layerThumbnails.value[layer.id] ?? ''
      }
    }))

    if (run === thumbnailRun)
      layerThumbnails.value = next
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
      scheduleMemoryRefresh()
      void refreshLayerThumbnails()
    }
    const handleCanvasClear = () => {
      bindController(p, updateLayers)
      updateLayers()
    }

    bindController(p, updateLayers)
    p.emitter.on('brush:up', updateLayers)
    p.emitter.on('eraser:up', updateLayers)
    p.emitter.on('canvas:clear', handleCanvasClear)

    removePainterListeners = () => {
      p.emitter.off('brush:up', updateLayers)
      p.emitter.off('eraser:up', updateLayers)
      p.emitter.off('canvas:clear', handleCanvasClear)
    }
  }

  function requirePainter(): Painter | undefined {
    return painter.value
  }

  const layerActions = {
    add: () => {
      const p = requirePainter()
      if (!p)
        return
      p.controller.layer.add({ label: `Layer ${layers.value.length + 1}` })
    },
    remove: (id: string) => {
      const p = requirePainter()
      if (!p || layers.value.length <= 1)
        return
      p.controller.layer.remove(id)
    },
    move: (id: string, toIndex: number) => {
      requirePainter()?.controller.layer.move(id, toIndex)
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
    await afterInit?.(p)
    syncState(p)
    painter.value = p
    void refreshLayerThumbnails()
    void refreshMemory()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
    removePainterListeners?.()
    removeControllerListeners?.()
    painter.value?.destroy()
    painter.value = undefined
    state.value = undefined
    memory.value = undefined
    layerThumbnails.value = {}
  })

  return {
    canvas,
    painter,
    state,
    memory,
    layers,
    activeLayerId,
    layerThumbnails,
    layerActions,
    refreshLayerThumbnails,
    refreshMemory,
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
