import type { BrushDab, BrushEngine, BrushInputPoint } from '../src'
import { describe, expect, it } from 'vitest'
import {
  createBrushEngineFromPreset,
  createDefaultBrushPresetRegistry,
  isTickableBrushEngine,
  rasterizeDab,
  sampleBrushTipAlpha,
  TiledSurface,
  TilePatchRecorder,
} from '../src'

const BLACK = { r: 0, g: 0, b: 0, a: 1 }

function pt(x: number, y: number, time: number, pressure = 1): BrushInputPoint {
  return { x, y, time, pressure, hasPressure: true }
}

function pixel(surface: TiledSurface, x: number, y: number): Uint8ClampedArray {
  return surface.readRegion({ x, y, width: 1, height: 1 })
}

describe('brush family verification', () => {
  it('renders hard, soft, and textured tips with distinct alpha coverage', () => {
    const hardEdge = sampleBrushTipAlpha({
      tipId: 'round-hard',
      x: 0.74,
      y: 0,
      hardness: 0,
      edgeSize: 0.01,
    })
    const softEdge = sampleBrushTipAlpha({
      tipId: 'round-soft',
      x: 0.74,
      y: 0,
      hardness: 0.55,
      edgeSize: 0.01,
    })
    const grainA = sampleBrushTipAlpha({ tipId: 'pencil-grain', x: -0.2, y: 0.1 })
    const grainB = sampleBrushTipAlpha({ tipId: 'pencil-grain', x: 0.2, y: 0.1 })

    expect(hardEdge).toBeGreaterThan(softEdge)
    expect(grainA).not.toBe(grainB)

    const hardSurface = new TiledSurface({ width: 64, height: 64, tileSize: 16 })
    const softSurface = new TiledSurface({ width: 64, height: 64, tileSize: 16 })
    rasterizeDab(hardSurface, {
      x: 32,
      y: 32,
      radius: 12,
      opacity: 1,
      color: BLACK,
      hardness: 0,
      tipId: 'round-hard',
    }, 'normal')
    rasterizeDab(softSurface, {
      x: 32,
      y: 32,
      radius: 12,
      opacity: 1,
      color: BLACK,
      hardness: 0.75,
      tipId: 'round-soft',
    }, 'normal')

    expect(pixel(hardSurface, 41, 32)[3]).toBeGreaterThan(pixel(softSurface, 41, 32)[3])
  })

  it('accumulates airbrush density while dwelling under injected ticks', () => {
    const registry = createDefaultBrushPresetRegistry()
    const preset = registry.require('airbrush')
    const early = renderAirbrushTicks([0, 250], preset.size)
    const late = renderAirbrushTicks([0, 250, 500, 750, 1000], preset.size)

    expect(pixel(late, 32, 32)[3]).toBeGreaterThan(pixel(early, 32, 32)[3])
    expect(late.readRegion({ x: 0, y: 0, width: 64, height: 64 }))
      .toEqual(renderAirbrushTicks([0, 250, 500, 750, 1000], preset.size).readRegion({ x: 0, y: 0, width: 64, height: 64 }))
  })

  it('keeps marker self-overlap bounded inside one stroke but allows cross-stroke layering', () => {
    const surface = new TiledSurface({ width: 64, height: 64, tileSize: 16 })
    const recorder = new TilePatchRecorder({ layerId: 'ink', surface })
    const dab = markerDab()

    recorder.beginStroke()
    for (let i = 0; i < 20; i++)
      recorder.paintDab(dab, 'normal')
    recorder.endStroke()
    const singleStrokeAlpha = pixel(surface, 32, 32)[3]

    expect(singleStrokeAlpha).toBeGreaterThan(0)
    expect(singleStrokeAlpha).toBeLessThanOrEqual(80)

    recorder.beginStroke()
    for (let i = 0; i < 20; i++)
      recorder.paintDab(dab, 'normal')
    recorder.endStroke()

    expect(pixel(surface, 32, 32)[3]).toBeGreaterThan(singleStrokeAlpha)
  })

  it('produces deterministic and distinct pixels for four brush families', () => {
    const registry = createDefaultBrushPresetRegistry()
    const ids = ['pen', 'pencil', 'marker', 'airbrush'] as const
    const hashes = ids.map((id) => {
      const preset = registry.require(id)
      const first = renderPreset()
      const second = renderPreset()

      expect(first).toEqual(second)
      expect(first.some(value => value > 0)).toBe(true)
      return hashBytes(first)

      function renderPreset(): Uint8ClampedArray {
        const engine = createBrushEngineFromPreset(preset, {
          opacity: preset.opacity,
          spacing: preset.spacing,
          hardness: preset.hardness,
          flow: preset.flow,
          baseSize: preset.size,
        })
        return renderEngine(engine, preset.size, id === 'airbrush')
      }
    })

    expect(new Set(hashes).size).toBe(4)
  })
})

function renderAirbrushTicks(ticks: number[], baseSize: number): TiledSurface {
  const registry = createDefaultBrushPresetRegistry()
  const preset = registry.require('airbrush')
  const engine = createBrushEngineFromPreset(preset, {
    opacity: preset.opacity,
    spacing: preset.spacing,
    hardness: preset.hardness,
    flow: preset.flow,
    baseSize,
  })
  const surface = new TiledSurface({ width: 64, height: 64, tileSize: 16 })

  engine.beginStroke({ color: BLACK, baseSize })
  for (const dab of engine.addPoint(pt(32, 32, ticks[0] ?? 0)))
    rasterizeDab(surface, dab, 'normal')

  if (!isTickableBrushEngine(engine))
    throw new Error('airbrush engine must be tickable')
  for (const time of ticks.slice(1)) {
    for (const dab of engine.tick(time))
      rasterizeDab(surface, dab, 'normal')
  }

  return surface
}

function renderEngine(engine: BrushEngine, baseSize: number, useTicks: boolean): Uint8ClampedArray {
  const surface = new TiledSurface({ width: 96, height: 96, tileSize: 24 })
  engine.beginStroke({ color: BLACK, baseSize })
  for (const point of [pt(16, 40, 0, 0.35), pt(48, 24, 80, 0.85), pt(80, 44, 160, 0.55)]) {
    for (const dab of engine.addPoint(point))
      rasterizeDab(surface, dab, 'normal')
  }
  if (useTicks && isTickableBrushEngine(engine)) {
    for (const dab of engine.tick(650))
      rasterizeDab(surface, dab, 'normal')
  }
  for (const dab of engine.endStroke())
    rasterizeDab(surface, dab, 'normal')

  return surface.readRegion({ x: 0, y: 0, width: 96, height: 96 })
}

function markerDab(): BrushDab {
  return {
    x: 32,
    y: 32,
    radius: 12,
    opacity: 0.25,
    color: BLACK,
    hardness: 0.16,
    tipId: 'marker-chisel',
    rotation: -Math.PI / 7,
    blendMode: 'max-alpha',
  }
}

function hashBytes(bytes: Uint8ClampedArray): number {
  let hash = 2166136261
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
