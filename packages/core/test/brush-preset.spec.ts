import type { BrushContext, BrushInputPoint, BrushPreset } from '../src'
import { describe, expect, it } from 'vitest'
import {
  clonePreset,
  createBrushEngineFromPreset,
  createDefaultBrushPresetRegistry,
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
    })

    expect(Array.isArray(cloned.sizeCurve)).toBe(true)
    if (!Array.isArray(cloned.sizeCurve) || !Array.isArray(preset.sizeCurve))
      throw new Error('expected point pressure curves')
    expect(cloned.sizeCurve).not.toBe(preset.sizeCurve)
    expect(cloned.sizeCurve[0]).not.toBe(preset.sizeCurve[0])

    cloned.sizeCurve[0]!.y = 0.9

    expect(preset.sizeCurve[0]!.y).toBe(0.2)
  })

  it('keeps smudge presets behind the P7-04 factory guard', () => {
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

    expect(() => createBrushEngineFromPreset(preset))
      .toThrow('smudge engine not implemented (P7-04)')
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
