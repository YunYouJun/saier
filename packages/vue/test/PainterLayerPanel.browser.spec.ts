import type { PainterLayerState } from '@saier/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import PainterLayerPanel from '../components/PainterLayerPanel.vue'

interface MountedLayerPanel {
  el: HTMLDivElement
  handlers: {
    onAddMask: ReturnType<typeof vi.fn>
    onRemoveMask: ReturnType<typeof vi.fn>
    onSelect: ReturnType<typeof vi.fn>
    onUpdateMaskEnabled: ReturnType<typeof vi.fn>
    onUpdatePaintTarget: ReturnType<typeof vi.fn>
  }
  unmount: () => void
}

const mounted: MountedLayerPanel[] = []
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lC3oWQAAAABJRU5ErkJggg=='

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createLayer(overrides: Partial<PainterLayerState> = {}): PainterLayerState {
  return {
    type: 'raster',
    id: 'layer-1',
    label: 'Ink',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    lockAlpha: false,
    clip: false,
    ...overrides,
  }
}

function mountLayerPanel(options: {
  activeLayerId?: string | null
  layer?: PainterLayerState
  maskThumbnail?: string
  paintTarget?: 'content' | 'mask'
} = {}): MountedLayerPanel {
  const layer = options.layer ?? createLayer()
  const handlers = {
    onAddMask: vi.fn(),
    onRemoveMask: vi.fn(),
    onSelect: vi.fn(),
    onUpdateMaskEnabled: vi.fn(),
    onUpdatePaintTarget: vi.fn(),
  }
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp(PainterLayerPanel, {
    'activeLayerId': options.activeLayerId ?? layer.id,
    'layers': [layer],
    'layerTree': [layer],
    'maskThumbnails': layer.mask && options.maskThumbnail
      ? { [layer.mask.id]: options.maskThumbnail }
      : {},
    'paintTarget': options.paintTarget ?? 'content',
    'thumbnails': { [layer.id]: TRANSPARENT_PIXEL },
    'onAddMask': handlers.onAddMask,
    'onRemoveMask': handlers.onRemoveMask,
    'onSelect': handlers.onSelect,
    'onUpdate:maskEnabled': handlers.onUpdateMaskEnabled,
    'onUpdate:paintTarget': handlers.onUpdatePaintTarget,
  })
  app.mount(el)

  const item = {
    el,
    handlers,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function buttonByTitle(root: ParentNode, title: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.getAttribute('title') === title)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button: ${title}`)
  return button
}

describe('painter layer panel mask controls', () => {
  it('emits addMask for a raster layer without a mask', async () => {
    const { el, handlers } = mountLayerPanel()

    buttonByTitle(el, 'Add layer mask').click()
    await nextTick()

    expect(handlers.onSelect).toHaveBeenCalledWith('layer-1')
    expect(handlers.onAddMask).toHaveBeenCalledWith('layer-1')
  })

  it('switches between content and mask paint targets from thumbnails', async () => {
    const layer = createLayer({ mask: { id: 'layer-1:mask', enabled: true } })
    const { el, handlers } = mountLayerPanel({ layer, maskThumbnail: TRANSPARENT_PIXEL })

    const contentButton = buttonByTitle(el, 'Paint layer content')
    const maskButton = buttonByTitle(el, 'Paint layer mask')

    expect(contentButton.getAttribute('aria-pressed')).toBe('true')
    expect(maskButton.getAttribute('aria-pressed')).toBe('false')

    maskButton.click()
    await nextTick()

    expect(handlers.onSelect).toHaveBeenCalledWith('layer-1')
    expect(handlers.onUpdatePaintTarget).toHaveBeenCalledWith('mask')
  })

  it('emits mask enabled and remove actions', async () => {
    const layer = createLayer({ mask: { id: 'layer-1:mask', enabled: true } })
    const { el, handlers } = mountLayerPanel({ layer })

    buttonByTitle(el, 'Disable layer mask').click()
    buttonByTitle(el, 'Remove layer mask').click()
    await nextTick()

    expect(handlers.onUpdateMaskEnabled).toHaveBeenCalledWith('layer-1', false)
    expect(handlers.onRemoveMask).toHaveBeenCalledWith('layer-1')
  })

  it('does not emit a mask paint target when the mask is disabled', async () => {
    const layer = createLayer({ mask: { id: 'layer-1:mask', enabled: false } })
    const { el, handlers } = mountLayerPanel({ layer })

    const maskButton = buttonByTitle(el, 'Paint layer mask')
    expect(maskButton.disabled).toBe(true)

    maskButton.click()
    await nextTick()

    expect(handlers.onUpdatePaintTarget).not.toHaveBeenCalled()
  })
})
