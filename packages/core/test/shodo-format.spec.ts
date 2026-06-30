import type { BrushInputPoint, ShodoStrokeRecord } from '../src'
import { describe, expect, it } from 'vitest'
import {
  replayShodoStroke,
  SHODO_OPERATION,
  SimpleBrushEngine,
  TiledSurface,
  toShodoStroke,
} from '../src'

const FULL_RECT = { x: 0, y: 0, width: 48, height: 32 }

describe('shodo stroke format', () => {
  it('converts points to relative {X,Y,T,P} stroke data and back through replay', () => {
    const points: BrushInputPoint[] = [
      { x: 8, y: 8, pressure: 1, hasPressure: true, time: 100 },
      { x: 16, y: 8, pressure: 0.8, hasPressure: true, time: 112 },
      { x: 24, y: 12, pressure: 0.6, hasPressure: true, time: 130 },
      { x: 32, y: 15, pressure: 1, hasPressure: true, time: 145 },
    ]
    const record: ShodoStrokeRecord = {
      O: SHODO_OPERATION.STROKE,
      L: 'ink',
      M: 'normal',
      D: toShodoStroke(points),
    }

    expect(record.D).toEqual([
      { X: 8, Y: 8, T: 0, P: 1 },
      { X: 16, Y: 8, T: 12, P: 0.8 },
      { X: 24, Y: 12, T: 30, P: 0.6 },
      { X: 32, Y: 15, T: 45, P: 1 },
    ])

    const first = replay(record)
    const second = replay(record)
    expect(first.readRegion(FULL_RECT)).toEqual(second.readRegion(FULL_RECT))
    expect(first.readRegion({ x: 16, y: 8, width: 1, height: 1 })[3]).toBeGreaterThan(0)
  })
})

function replay(record: ShodoStrokeRecord): TiledSurface {
  const surface = new TiledSurface({ width: FULL_RECT.width, height: FULL_RECT.height, tileSize: 16 })
  const dirty = replayShodoStroke(record, {
    engine: new SimpleBrushEngine({
      spacingRatio: 0.25,
      minSizeRatio: 0.5,
      maxSizeRatio: 1,
      hardness: 0,
    }),
    context: {
      baseSize: 8,
      color: { r: 0, g: 0, b: 0, a: 1 },
    },
    surface,
  })

  expect(dirty.width).toBeGreaterThan(0)
  expect(dirty.height).toBeGreaterThan(0)
  return surface
}
