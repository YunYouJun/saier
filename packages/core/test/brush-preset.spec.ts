import type { BrushContext, BrushDab, BrushEngine, BrushInputPoint, BrushPreset } from '../src'
import { describe, expect, it } from 'vitest'
import {
  clonePreset,
  createBrushEngineFromPreset,
  createDefaultBrushEngineRegistry,
  createDefaultBrushPresetRegistry,
  isSmudgeBrushEngine,
  loadBrushEngineRegistration,
  parseMyPaintBrushPreset,
  toBrushPresetSummary,
} from '../src'

const BLACK = { r: 0, g: 0, b: 0, a: 1 }

function ctx(baseSize = 24): BrushContext {
  return { color: BLACK, baseSize }
}

function pt(x: number, y: number, time: number, pressure = 1): BrushInputPoint {
  return { x, y, time, pressure, hasPressure: true }
}

describe('brush presets', () => {
  it('registers, removes, and lists presets defensively', () => {
    const registry = createDefaultBrushPresetRegistry()

    expect(registry.list().map(preset => preset.id)).toEqual([
      'pen',
      'pencil',
      'marker',
      'airbrush',
      'calligraphy',
      'smudge',
      'blender',
      'watercolor',
    ])

    registry.register({
      ...registry.require('pen'),
      id: 'inking-small',
      name: 'Inking Small',
      size: 6,
    })

    const custom = registry.require('inking-small')
    custom.size = 100

    expect(registry.require('inking-small').size).toBe(6)
    expect(registry.unregister('inking-small')).toBe(true)
    expect(registry.get('inking-small')).toBeUndefined()
  })

  it('clones P7 preset parameters and nested curve points defensively', () => {
    const preset: BrushPreset = {
      id: 'wet-mix',
      name: 'Wet Mix',
      group: 'Custom',
      source: 'custom',
      custom: true,
      tags: ['wash'],
      engine: 'smudge',
      tipId: 'round-soft',
      size: 18,
      opacity: 0.7,
      spacing: 0.25,
      hardness: 0.65,
      smudge: 0.35,
      colorAmount: 0.6,
      dilution: 0.45,
      persistence: 0.7,
      wetEdge: 0.5,
      density: 0.8,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.35,
      sizeCurve: [
        { x: 0, y: 0.2 },
        { x: 1, y: 1 },
      ],
    }

    const cloned = clonePreset(preset)

    expect(cloned).toEqual(preset)
    expect(cloned).not.toBe(preset)
    expect(cloned).toMatchObject({
      smudge: 0.35,
      colorAmount: 0.6,
      dilution: 0.45,
      persistence: 0.7,
      wetEdge: 0.5,
      density: 0.8,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.35,
      tags: ['wash'],
    })

    expect(Array.isArray(cloned.sizeCurve)).toBe(true)
    if (!Array.isArray(cloned.sizeCurve) || !Array.isArray(preset.sizeCurve))
      throw new Error('expected point pressure curves')
    expect(cloned.sizeCurve).not.toBe(preset.sizeCurve)
    expect(cloned.sizeCurve[0]).not.toBe(preset.sizeCurve[0])

    cloned.sizeCurve[0]!.y = 0.9
    cloned.tags![0] = 'mutated'

    expect(preset.sizeCurve[0]!.y).toBe(0.2)
    expect(preset.tags![0]).toBe('wash')
  })

  it('creates smudge engines from P7-04 presets', () => {
    const preset: BrushPreset = {
      id: 'smudge-placeholder',
      name: 'Smudge Placeholder',
      engine: 'smudge',
      tipId: 'round-soft',
      size: 18,
      opacity: 1,
      spacing: 0.25,
      hardness: 0.4,
      smudge: 0.8,
      colorAmount: 0,
    }

    expect(isSmudgeBrushEngine(createBrushEngineFromPreset(preset)))
      .toBe(true)
  })

  it('creates P9 external brush engines through a registry slot', () => {
    class ExternalTraceEngine implements BrushEngine {
      beginStroke(_ctx: BrushContext): void {}

      addPoint(point: BrushInputPoint): BrushDab[] {
        return [{
          x: point.x,
          y: point.y,
          radius: 3,
          opacity: 1,
          color: BLACK,
          tipId: 'external-trace',
        }]
      }

      endStroke(): BrushDab[] {
        return []
      }
    }

    const engineRegistry = createDefaultBrushEngineRegistry()
    engineRegistry.register({
      id: 'external-trace',
      label: 'External Trace',
      experimental: true,
      create: () => new ExternalTraceEngine(),
    })

    const preset: BrushPreset = {
      id: 'external-trace-preset',
      name: 'External Trace Preset',
      engine: 'external-trace',
      tipId: 'external-trace',
      size: 12,
      opacity: 1,
      spacing: 0.25,
      hardness: 0,
    }

    const engine = createBrushEngineFromPreset(preset, {}, engineRegistry)
    engine.beginStroke(ctx(preset.size))

    expect(engine.addPoint(pt(4, 5, 0))[0]).toMatchObject({
      x: 4,
      y: 5,
      tipId: 'external-trace',
    })
    expect(toBrushPresetSummary(preset, engineRegistry)).toMatchObject({
      engineAvailable: true,
      engineLabel: 'External Trace',
      experimental: true,
    })
  })

  it('reports missing P9 engines without falling back to builtins', () => {
    const preset: BrushPreset = {
      id: 'missing-engine-preset',
      name: 'Missing Engine Preset',
      engine: 'missing-engine',
      tipId: 'round-soft',
      size: 12,
      opacity: 1,
      spacing: 0.25,
      hardness: 0,
    }

    expect(() => createBrushEngineFromPreset(preset)).toThrow(/No brush engine registered/)
    expect(toBrushPresetSummary(preset)).toMatchObject({
      engineAvailable: false,
      requiresSurfaceSampler: false,
    })
  })

  it('loads async P9 engine registrations before registry registration', async () => {
    class AsyncTraceEngine implements BrushEngine {
      beginStroke(_ctx: BrushContext): void {}
      addPoint(point: BrushInputPoint): BrushDab[] {
        return [{
          x: point.x,
          y: point.y,
          radius: 2,
          opacity: 1,
          color: BLACK,
        }]
      }

      endStroke(): BrushDab[] {
        return []
      }
    }

    const registration = await loadBrushEngineRegistration({
      id: 'async-trace',
      label: 'Async Trace',
      experimental: true,
      load: async () => () => new AsyncTraceEngine(),
    })
    const registry = createDefaultBrushEngineRegistry()
    registry.register(registration)

    expect(registry.getDescriptor('async-trace')).toMatchObject({
      label: 'Async Trace',
      experimental: true,
    })
  })

  it('maps representative MyPaint .myb settings into custom saier presets', () => {
    const classic = parseMyPaintBrushPreset(JSON.stringify({
      parent_brush_name: 'Classic Ink',
      group: 'MyPaint Classic',
      settings: {
        radius_logarithmic: { base_value: Math.log(8) },
        opaque: { base_value: 0.9 },
        hardness: { base_value: 0.85 },
        dabs_per_actual_radius: { base_value: 5 },
      },
    }))
    const blender = parseMyPaintBrushPreset(JSON.stringify({
      parent_brush_name: 'Blend Soft',
      settings: {
        radius_logarithmic: { base_value: Math.log(24) },
        opaque: { base_value: 0.6 },
        smudge: { base_value: 0.7 },
        smudge_length: { base_value: 0.8 },
        hardness: { base_value: 0.2 },
        dabs_per_actual_radius: { base_value: 3 },
      },
    }))
    const legacy = parseMyPaintBrushPreset(`
# Legacy Pencil
radius_logarithmic 2.302585
opaque 0.5
hardness 0.6
dabs_per_actual_radius 4
`)

    expect(classic).toMatchObject({
      id: 'mypaint-classic-ink',
      name: 'Classic Ink',
      group: 'MyPaint Classic',
      source: 'mypaint',
      custom: true,
      engine: 'simple',
      size: 16,
      opacity: 0.9,
      spacing: 0.2,
    })
    expect(blender).toMatchObject({
      name: 'Blend Soft',
      engine: 'smudge',
      smudge: 0.7,
      persistence: 0.8,
      size: 48,
    })
    expect(legacy).toMatchObject({
      id: 'mypaint-legacy-pencil',
      name: 'Legacy Pencil',
      source: 'mypaint',
      custom: true,
      size: 20,
    })
  })

  it('passes P7 deposit parameters into simple engine dabs', () => {
    const preset: BrushPreset = {
      id: 'wet-pen',
      name: 'Wet Pen',
      engine: 'simple',
      tipId: 'round-soft',
      size: 18,
      opacity: 1,
      spacing: 0.25,
      hardness: 0.4,
      density: 0.6,
      dilution: 0.3,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.4,
      wetEdge: 0.2,
    }

    expect(stroke(preset, [pt(0, 0, 0)])[0]).toMatchObject({
      density: 0.6,
      dilution: 0.3,
      wetEdge: 0.2,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0.4,
    })
  })

  it('drives visibly different dab sequences from preset data', () => {
    const registry = createDefaultBrushPresetRegistry()
    const points = [pt(0, 0, 0, 0.5), pt(80, 0, 80, 1)]

    const pen = stroke(registry.require('pen'), points)
    const pencil = stroke(registry.require('pencil'), points)
    const marker = stroke(registry.require('marker'), points)

    expect(pen[0]).toMatchObject({ tipId: 'round-hard', blendMode: 'source-over' })
    expect(pencil[0]).toMatchObject({ tipId: 'pencil-grain' })
    expect(marker[0]).toMatchObject({ tipId: 'marker-chisel', blendMode: 'max-alpha' })
    expect(new Set([pen.length, pencil.length, marker.length]).size).toBeGreaterThan(1)
    expect(marker[0].rotation).not.toBe(0)
  })
})

function stroke(
  preset: BrushPreset,
  points: BrushInputPoint[],
) {
  const engine = createBrushEngineFromPreset(preset, {
    opacity: preset.opacity,
    spacing: preset.spacing,
    hardness: preset.hardness,
    flow: preset.flow,
    baseSize: preset.size,
  })

  engine.beginStroke(ctx(preset.size))
  const dabs = points.flatMap(point => engine.addPoint(point))
  dabs.push(...engine.endStroke())
  return dabs
}
