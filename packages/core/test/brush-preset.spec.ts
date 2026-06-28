import type { BrushContext, BrushInputPoint, BrushPreset } from '../src'
import { describe, expect, it } from 'vitest'
import {
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
