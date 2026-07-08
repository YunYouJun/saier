import type {
  BrushEngine,
  BrushInputPoint,
  SaierStrokeCommit,
  ShodoStrokeRecord,
} from '../src'
import { describe, expect, it } from 'vitest'
import {
  AirbrushEngine,
  assertSaierStrokeCommit,
  isSaierStrokeCommit,
  replaySaierStroke,
  SAIER_STROKE_SCHEMA,
  saierStrokeCommitToShodo,
  SHODO_OPERATION,
  shodoStrokeToSaierStrokeCommit,
  SimpleBrushEngine,
  TiledSurface,
  toSaierStrokeEvents,
} from '../src'

const FULL_RECT = { x: 0, y: 0, width: 64, height: 48 }
const BLACK = { r: 0, g: 0, b: 0, a: 1 }

describe('saier stroke format', () => {
  it('replays canonical point events into deterministic pixels', () => {
    const points: BrushInputPoint[] = [
      pt(8, 8, 100, 1),
      pt(18, 10, 112, 0.8),
      pt(30, 16, 130, 0.6),
      pt(44, 20, 145, 1),
    ]
    const commit = strokeCommit({
      events: toSaierStrokeEvents(points),
    })

    expect(commit.events).toEqual([
      { kind: 'point', x: 8, y: 8, t: 0, pressure: 1, hasPressure: true, pointerType: 'pen' },
      { kind: 'point', x: 18, y: 10, t: 12, pressure: 0.8, hasPressure: true, pointerType: 'pen' },
      { kind: 'point', x: 30, y: 16, t: 30, pressure: 0.6, hasPressure: true, pointerType: 'pen' },
      { kind: 'point', x: 44, y: 20, t: 45, pressure: 1, hasPressure: true, pointerType: 'pen' },
    ])

    const first = replay(commit, () => new SimpleBrushEngine({ spacingRatio: 0.25, hardness: 0 }))
    const second = replay(commit, () => new SimpleBrushEngine({ spacingRatio: 0.25, hardness: 0 }))

    expect(first.surface.readRegion(FULL_RECT)).toEqual(second.surface.readRegion(FULL_RECT))
    expect(first.result.dirtyRect.width).toBeGreaterThan(0)
    expect(first.result.patchHash).toMatch(/^fnv1a32:/)
    expect(first.result.patchHashMatches).toBeUndefined()
  })

  it('replays airbrush dwell through recorded tick events', () => {
    const withTicks = strokeCommit({
      brushEngine: { id: 'airbrush', version: '0.1.6-beta.1' },
      brushPresetId: 'airbrush',
      events: [
        { kind: 'point', x: 24, y: 24, t: 0, pressure: 1, hasPressure: true },
        { kind: 'tick', t: 100 },
        { kind: 'tick', t: 200 },
      ],
    })
    const withoutTicks = strokeCommit({
      brushEngine: { id: 'airbrush', version: '0.1.6-beta.1' },
      brushPresetId: 'airbrush',
      events: [
        { kind: 'point', x: 24, y: 24, t: 0, pressure: 1, hasPressure: true },
      ],
    })
    const createEngine = () => new AirbrushEngine({ flowRate: 10, minOpacity: 0.1, maxOpacity: 0.1 })

    const dwell = replay(withTicks, createEngine)
    const pointOnly = replay(withoutTicks, createEngine)

    expect(alphaAt(dwell.surface, 24, 24)).toBeGreaterThan(alphaAt(pointOnly.surface, 24, 24))
    expect(dwell.surface.readRegion(FULL_RECT)).toEqual(
      replay(withTicks, createEngine).surface.readRegion(FULL_RECT),
    )
  })

  it('validates public saier stroke commits without shodo types', () => {
    const commit = strokeCommit({
      events: [
        { kind: 'point', x: 24, y: 24, t: 0, pressure: 1, hasPressure: true },
        { kind: 'tick', t: 100 },
      ],
    })

    expect(isSaierStrokeCommit(commit)).toBe(true)
    expect(() => assertSaierStrokeCommit(commit)).not.toThrow()

    expect(isSaierStrokeCommit({
      ...commit,
      brushEngine: { id: 'simple' },
    })).toBe(false)
    expect(() => assertSaierStrokeCommit({
      ...commit,
      brushPresetSnapshot: undefined,
    })).toThrow(/Invalid Saier stroke commit/)
  })

  it('converts legacy shodo stroke records to saier stroke commits', () => {
    const shodo: ShodoStrokeRecord = {
      O: SHODO_OPERATION.STROKE,
      L: 'ink',
      M: 'erase',
      D: [
        { X: 10, Y: 12, T: 0, P: 1 },
        { X: 20, Y: 16, T: 14, P: 0.5 },
      ],
    }

    const commit = shodoStrokeToSaierStrokeCommit(shodo, {
      id: 'stroke-legacy',
      brushEngine: { id: 'simple', version: '0.1.6-beta.1' },
      brushPresetId: 'pen',
      brushPresetSnapshot: { id: 'pen' },
      brushContextSnapshot: { color: BLACK, baseSize: 8 },
    })

    expect(commit).toMatchObject({
      schema: SAIER_STROKE_SCHEMA,
      id: 'stroke-legacy',
      layerId: 'ink',
      paintTarget: 'layer',
      tool: 'eraser',
      compositeMode: 'erase',
    })
    expect(commit.events).toEqual([
      { kind: 'point', x: 10, y: 12, t: 0, pressure: 1, hasPressure: true },
      { kind: 'point', x: 20, y: 16, t: 14, pressure: 0.5, hasPressure: true },
    ])
    expect(saierStrokeCommitToShodo(commit)).toEqual(shodo)
  })

  it('detects patch hash mismatches without failing replay', () => {
    const commit = strokeCommit({
      events: toSaierStrokeEvents([pt(16, 16, 0, 1), pt(32, 16, 16, 1)]),
    })
    const first = replay(commit, () => new SimpleBrushEngine({ spacingRatio: 0.25 }))
    const matching = replay({
      ...commit,
      result: {
        dirtyRect: first.result.dirtyRect,
        patchHash: first.result.patchHash,
      },
    }, () => new SimpleBrushEngine({ spacingRatio: 0.25 }))
    const mismatching = replay({
      ...commit,
      result: {
        dirtyRect: first.result.dirtyRect,
        patchHash: 'fnv1a32:00000000',
      },
    }, () => new SimpleBrushEngine({ spacingRatio: 0.25 }))

    expect(matching.result.patchHashMatches).toBe(true)
    expect(mismatching.result.patchHashMatches).toBe(false)
  })
})

function pt(x: number, y: number, time: number, pressure: number): BrushInputPoint {
  return { x, y, time, pressure, hasPressure: true, pointerType: 'pen' }
}

function strokeCommit(overrides: Partial<SaierStrokeCommit>): SaierStrokeCommit {
  return {
    schema: SAIER_STROKE_SCHEMA,
    id: 'stroke-1',
    layerId: 'ink',
    paintTarget: 'layer',
    tool: 'brush',
    compositeMode: 'normal',
    brushEngine: { id: 'simple', version: '0.1.6-beta.1' },
    brushPresetId: 'pen',
    brushPresetSnapshot: { id: 'pen' },
    brushContextSnapshot: { color: BLACK, baseSize: 8 },
    inputPipeline: 'resolved-v1',
    events: [],
    ...overrides,
  }
}

function replay(commit: SaierStrokeCommit, createEngine: () => BrushEngine) {
  const surface = new TiledSurface({ width: FULL_RECT.width, height: FULL_RECT.height, tileSize: 16 })
  const result = replaySaierStroke(commit, {
    engine: createEngine(),
    surface,
  })
  return { surface, result }
}

function alphaAt(surface: TiledSurface, x: number, y: number): number {
  return surface.readRegion({ x, y, width: 1, height: 1 })[3]!
}
