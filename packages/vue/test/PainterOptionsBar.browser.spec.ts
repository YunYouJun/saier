import type { BrushPresetId, PainterBrushState, PainterControllerState } from '@saier/core'
import { DEFAULT_BRUSH_PRESETS } from '@saier/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import PainterOptionsBar from '../components/PainterOptionsBar.vue'

interface MountedOptionsBar {
  el: HTMLDivElement
  painter: ReturnType<typeof createFakePainter>
  unavailablePreset: ReturnType<typeof vi.fn>
  unmount: () => void
}

const mounted: MountedOptionsBar[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createFakePainter(options: { presetId?: BrushPresetId, hasSampler?: boolean, includeCustomPresetGroup?: string, includeExternalPreset?: boolean } = {}) {
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
    presets: [
      ...DEFAULT_BRUSH_PRESETS.map(item => ({
        id: item.id,
        name: item.name,
        group: item.group,
        engine: item.engine,
        tipId: item.tipId,
        engineAvailable: true,
        requiresSurfaceSampler: item.engine === 'smudge',
        supportsMixingControls: item.engine === 'smudge',
      })),
      ...(
        options.includeCustomPresetGroup
          ? [{
              id: 'custom-brush' as BrushPresetId,
              name: 'Custom Brush',
              group: options.includeCustomPresetGroup,
              source: 'custom' as const,
              custom: true,
              engine: 'simple',
              tipId: 'round-hard',
              engineAvailable: true,
              requiresSurfaceSampler: false,
              supportsMixingControls: false,
            }]
          : []
      ),
      ...(
        options.includeExternalPreset
          ? [{
              id: 'myb-wasm' as BrushPresetId,
              name: 'MyPaint WASM',
              group: 'External',
              engine: 'mypaint-wasm',
              tipId: 'round-soft',
              engineAvailable: false,
              requiresSurfaceSampler: false,
              supportsMixingControls: false,
              experimental: true,
            }]
          : []
      ),
    ],
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
    brush: {
      getStabilizerStrength: vi.fn(() => 1),
      setColorAmount: vi.fn(),
      createCustomPreset: vi.fn((createOptions: { name: string, group?: string }) => ({
        id: 'custom-brush' as BrushPresetId,
        name: createOptions.name,
        group: createOptions.group,
        source: 'custom',
        custom: true,
        engine: 'simple',
        tipId: 'round-hard',
        size: 10,
        opacity: 1,
        spacing: 0.22,
        hardness: 0,
      })),
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
      setStabilizerStrength: vi.fn(),
      setWetEdge: vi.fn(),
      removePreset: vi.fn(),
    },
    controller: {
      getState: () => state,
      off: vi.fn(),
      on: vi.fn(),
    },
    eraser: {
      getStabilizerStrength: vi.fn(() => 1),
      setPressureEnabled: vi.fn(),
      setStabilizerStrength: vi.fn(),
    },
    surface: options.hasSampler === false ? {} : { sampleRegion: vi.fn() },
  }
}

function mountOptionsBar(options?: Parameters<typeof createFakePainter>[0]): MountedOptionsBar {
  const painter = createFakePainter(options)
  const unavailablePreset = vi.fn()
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp(PainterOptionsBar, { painter, onUnavailablePreset: unavailablePreset })
  app.mount(el)

  const item = {
    el,
    painter,
    unavailablePreset,
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

function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.textContent?.includes(text))
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button text: ${text}`)
  return button
}

describe('painter options bar P7 controls', () => {
  it('allows watercolor selection when sampleRegion is available', async () => {
    const { el, painter } = mountOptionsBar({ hasSampler: true })

    buttonByText(el, 'Painting').click()
    await nextTick()
    buttonByLabel(el, 'Watercolor').click()
    await nextTick()

    expect(painter.brush.setPreset).toHaveBeenCalledWith('watercolor')
  })

  it('disables smudge-family presets when sampleRegion is unavailable', async () => {
    const { el, painter, unavailablePreset } = mountOptionsBar({ hasSampler: false })

    buttonByText(el, 'Painting').click()
    await nextTick()
    const watercolor = buttonByLabel(el, 'Watercolor')

    expect(watercolor.disabled).toBe(false)
    expect(watercolor.getAttribute('aria-disabled')).toBe('true')
    expect(watercolor.title).toBe('Requires tiled backend')
    watercolor.click()
    await nextTick()

    expect(painter.brush.setPreset).not.toHaveBeenCalled()
    expect(unavailablePreset).toHaveBeenCalledWith({
      presetId: 'watercolor',
      presetName: 'Watercolor',
      reason: 'missing-surface-sampler',
      message: 'Requires tiled backend',
    })
  })

  it('disables external presets while their engine is unavailable', async () => {
    const { el, painter, unavailablePreset } = mountOptionsBar({ includeExternalPreset: true })

    buttonByText(el, 'External').click()
    await nextTick()
    const external = buttonByLabel(el, 'MyPaint WASM')

    expect(external.disabled).toBe(false)
    expect(external.getAttribute('aria-disabled')).toBe('true')
    expect(external.title).toBe('External brush engine is not loaded')
    external.click()
    await nextTick()

    expect(painter.brush.setPreset).not.toHaveBeenCalled()
    expect(unavailablePreset).toHaveBeenCalledWith({
      presetId: 'myb-wasm',
      presetName: 'MyPaint WASM',
      reason: 'missing-engine',
      message: 'External brush engine is not loaded',
    })
  })

  it('renders P7 mixing controls for smudge-family presets', () => {
    const { el } = mountOptionsBar({ presetId: 'watercolor', hasSampler: true })

    expect(el.textContent).toContain('Pickup')
    expect(el.textContent).toContain('Wet edge')
    expect(el.textContent).toContain('Paper')
    expect(el.textContent).toContain('Grain')
  })

  it('renders a custom stabilizer level control', () => {
    const { el } = mountOptionsBar()

    expect(el.textContent).toContain('Stabilizer')
  })

  it('renders a compact grouped brush picker and saves current settings as a custom brush', async () => {
    const { el, painter } = mountOptionsBar()

    expect(el.textContent).toContain('Sketching')
    expect(el.querySelector('.brush-preset-grid')).toBeTruthy()
    expect(el.querySelector('.brush-preset-preview')).toBeTruthy()

    buttonByLabel(el, 'Save current brush').click()
    await nextTick()

    expect(painter.brush.createCustomPreset).toHaveBeenCalledWith({
      name: 'Custom Brush',
      group: 'Sketching',
      select: true,
    })
  })

  it('creates an empty brush group and saves the current brush into it', async () => {
    const { el, painter } = mountOptionsBar()

    buttonByLabel(el, 'New brush group').click()
    await nextTick()

    expect(el.textContent).toContain('Custom Group')

    buttonByLabel(el, 'Save current brush').click()
    await nextTick()

    expect(painter.brush.createCustomPreset).toHaveBeenCalledWith({
      name: 'Custom Brush',
      group: 'Custom Group',
      select: true,
    })
  })

  it('removes custom brush groups and their custom presets', async () => {
    const { el, painter } = mountOptionsBar({ includeCustomPresetGroup: 'Favorites' })

    buttonByText(el, 'Favorites').click()
    await nextTick()
    buttonByLabel(el, 'Remove brush group').click()
    await nextTick()

    expect(painter.brush.removePreset).toHaveBeenCalledWith('custom-brush')
  })
})
