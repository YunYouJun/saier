import type { BrushPresetId, PainterBrushState, PainterControllerState } from '@saier/core'
import { DEFAULT_BRUSH_PRESETS } from '@saier/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import PainterOptionsBar from '../components/PainterOptionsBar.vue'

interface MountedOptionsBar {
  el: HTMLDivElement
  painter: ReturnType<typeof createFakePainter>
  unmount: () => void
}

const mounted: MountedOptionsBar[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createFakePainter(options: { presetId?: BrushPresetId, hasSampler?: boolean } = {}) {
  const presetId = options.presetId ?? 'pen'
  const preset = DEFAULT_BRUSH_PRESETS.find(item => item.id === presetId) ?? DEFAULT_BRUSH_PRESETS[0]!
  const brush: PainterBrushState = {
    presetId,
    size: preset.size,
    color: { r: 0, g: 0, b: 0, a: 1 },
    opacity: preset.opacity,
    spacing: preset.spacing,
    hardness: preset.hardness,
    flow: preset.flow ?? 1,
    smudge: preset.smudge ?? 0,
    colorAmount: preset.colorAmount ?? 1,
    dilution: preset.dilution ?? 0,
    persistence: preset.persistence ?? 0,
    wetEdge: preset.wetEdge ?? 0,
    density: preset.density ?? 1,
    paperTextureId: preset.paperTextureId,
    paperTextureStrength: preset.paperTextureStrength ?? 0,
    presets: DEFAULT_BRUSH_PRESETS.map(item => ({
      id: item.id,
      name: item.name,
      engine: item.engine,
      tipId: item.tipId,
    })),
  }
  const state: PainterControllerState = {
    activeLayerId: 'layer-1',
    brush,
    history: { canRedo: false, canUndo: false },
    layers: [],
    tool: 'brush',
  }

  return {
    brush: {
      setColorAmount: vi.fn(),
      setDensity: vi.fn(),
      setDilution: vi.fn(),
      setFlow: vi.fn(),
      setHardness: vi.fn(),
      setOpacity: vi.fn(),
      setPaperTextureId: vi.fn(),
      setPaperTextureStrength: vi.fn(),
      setPersistence: vi.fn(),
      setPreset: vi.fn(),
      setPressureEnabled: vi.fn(),
      setSize: vi.fn(),
      setSmudge: vi.fn(),
      setSpacing: vi.fn(),
      setWetEdge: vi.fn(),
    },
    controller: {
      getState: () => state,
      off: vi.fn(),
      on: vi.fn(),
    },
    eraser: {
      setPressureEnabled: vi.fn(),
    },
    surface: options.hasSampler === false ? {} : { sampleRegion: vi.fn() },
  }
}

function mountOptionsBar(options?: Parameters<typeof createFakePainter>[0]): MountedOptionsBar {
  const painter = createFakePainter(options)
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp(PainterOptionsBar, { painter })
  app.mount(el)

  const item = {
    el,
    painter,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function buttonByLabel(root: ParentNode, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.getAttribute('aria-label') === label)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button: ${label}`)
  return button
}

describe('painter options bar P7 controls', () => {
  it('allows watercolor selection when sampleRegion is available', async () => {
    const { el, painter } = mountOptionsBar({ hasSampler: true })

    buttonByLabel(el, 'Watercolor').click()
    await nextTick()

    expect(painter.brush.setPreset).toHaveBeenCalledWith('watercolor')
  })

  it('disables smudge-family presets when sampleRegion is unavailable', async () => {
    const { el, painter } = mountOptionsBar({ hasSampler: false })
    const watercolor = buttonByLabel(el, 'Watercolor')

    expect(watercolor.disabled).toBe(true)
    watercolor.click()
    await nextTick()

    expect(painter.brush.setPreset).not.toHaveBeenCalled()
  })

  it('renders P7 mixing controls for smudge-family presets', () => {
    const { el } = mountOptionsBar({ presetId: 'watercolor', hasSampler: true })

    expect(el.textContent).toContain('Pickup')
    expect(el.textContent).toContain('Wet edge')
    expect(el.textContent).toContain('Paper')
    expect(el.textContent).toContain('Grain')
  })
})
