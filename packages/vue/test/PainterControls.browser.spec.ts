import type { PainterBrushState, PainterControllerState } from '@saier/core'
import type { Painter } from 'saier'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import PainterControls from '../components/PainterControls.vue'

interface MountedControls {
  el: HTMLDivElement
  painter: Painter
  unmount: () => void
}

const mounted: MountedControls[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createFakePainter(): Painter {
  const brush: PainterBrushState = {
    presetId: 'pen',
    size: 10,
    color: { r: 0, g: 0, b: 0, a: 1 },
    opacity: 1,
    spacing: 0.2,
    hardness: 0.8,
    flow: 1,
    smudge: 0,
    colorAmount: 1,
    dilution: 0,
    persistence: 0,
    wetEdge: 0,
    density: 1,
    paperTextureStrength: 0,
    presets: [],
  }
  const state: PainterControllerState = {
    activeLayerId: 'layer-1',
    brush,
    history: { canRedo: false, canUndo: false },
    layers: [],
    layerTree: [],
    tool: 'brush',
  }

  return {
    background: { color: 0xFFFFFF },
    brush: { setColor: vi.fn() },
    canvas: {
      scaleDown: vi.fn(),
      scaleUp: vi.fn(),
    },
    clearCanvas: vi.fn(),
    controller: {
      getState: () => state,
      off: vi.fn(),
      on: vi.fn(),
    },
    extractCanvas: vi.fn(),
    history: {
      redo: vi.fn(),
      undo: vi.fn(),
    },
    useTool: vi.fn(),
  } as unknown as Painter
}

function mountControls(options: {
  colorPanelMode?: 'inline' | 'popover'
  guardClear?: boolean
  mode?: 'full' | 'palette'
  onClear?: ReturnType<typeof vi.fn>
} = {}): MountedControls & { onClear: ReturnType<typeof vi.fn> } {
  const onClear = options.onClear ?? vi.fn()
  const painter = createFakePainter()
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp(PainterControls, {
    colorPanelMode: options.colorPanelMode,
    guardClear: options.guardClear,
    labels: { clear: 'Clear' },
    mode: options.mode,
    onClear,
    painter,
  })
  app.component('PainterIconButton', defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => h('button', { type: 'button', ...attrs }, slots.default?.())
    },
  }))
  app.component('PainterColorPicker', defineComponent({
    setup() {
      return () => h('div')
    },
  }))
  app.mount(el)

  const item = {
    el,
    onClear,
    painter,
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

describe('painter controls', () => {
  it('emits clear instead of mutating the painter directly when clear is guarded', async () => {
    const { el, onClear, painter } = mountControls({ guardClear: true })

    buttonByTitle(el, 'Clear').click()
    await nextTick()

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(painter.clearCanvas).not.toHaveBeenCalled()
  })

  it('keeps direct clear behavior by default', async () => {
    const { el, onClear, painter } = mountControls()

    buttonByTitle(el, 'Clear').click()
    await nextTick()

    expect(onClear).not.toHaveBeenCalled()
    expect(painter.clearCanvas).toHaveBeenCalledTimes(1)
  })

  it('uses the compact picker layout for the inline palette', async () => {
    const { el } = mountControls({ colorPanelMode: 'inline', mode: 'palette' })
    await nextTick()

    const picker = el.querySelector<HTMLElement>('.color-wheel-picker--compact')
    const swatch = el.querySelector<HTMLElement>('.color-wheel-picker__swatch')
    const wheel = el.querySelector<HTMLElement>('.color-wheel-picker__wheel')

    expect(picker).not.toBeNull()
    expect(wheel?.style.width).toBe('84px')
    expect(getComputedStyle(swatch!).width).toBe('24px')
    expect(el.querySelectorAll('.painter-slider--compact')).toHaveLength(3)
  })
})
