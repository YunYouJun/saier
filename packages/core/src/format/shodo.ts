import type { TiledSurface } from '../surface'
import type {
  BrushContext,
  BrushEngine,
  BrushInputPoint,
  CompositeMode,
  DirtyRect,
  RGBA,
} from '../types'
import { empty, union } from '../math'
import { rasterizeDab } from '../surface'

export const SHODO_OPERATION = {
  STROKE: 0,
  SET_BRUSH: 1,
  SET_INK: 2,
  SET_COLOR: 3,
} as const

export type ShodoOperation = typeof SHODO_OPERATION[keyof typeof SHODO_OPERATION]

export interface ShodoBrushState {
  presetId?: string
  size?: number
  opacity?: number
  spacing?: number
  hardness?: number
  flow?: number
}

export interface ShodoStrokePoint {
  X: number
  Y: number
  T: number
  P?: number
}

export interface ShodoStrokeRecord {
  O: typeof SHODO_OPERATION.STROKE
  /** Optional target layer/surface id for operation-stream playback. */
  L?: string
  /** Composite mode used by the stroke. Defaults to `normal`. */
  M?: CompositeMode
  D: ShodoStrokePoint[]
}

export interface ShodoSetBrushRecord {
  O: typeof SHODO_OPERATION.SET_BRUSH
  D: ShodoBrushState
}

export interface ShodoSetInkRecord {
  O: typeof SHODO_OPERATION.SET_INK
  D: {
    amount: number
  }
}

export interface ShodoSetColorRecord {
  O: typeof SHODO_OPERATION.SET_COLOR
  D: RGBA
}

export type ShodoHistoryRecord
  = | ShodoStrokeRecord
    | ShodoSetBrushRecord
    | ShodoSetInkRecord
    | ShodoSetColorRecord

export interface ShodoHistory {
  v: string
  dpi: number
  pv: number
  w: number
  h: number
  sh: ShodoHistoryRecord[]
}

export interface ReplayShodoStrokeOptions {
  engine: BrushEngine
  context: BrushContext
  surface: TiledSurface
  mode?: CompositeMode
}

export function toShodoStroke(points: BrushInputPoint[]): ShodoStrokePoint[] {
  const start = points[0]?.time ?? 0
  return points.map(point => ({
    X: point.x,
    Y: point.y,
    T: point.time - start,
    P: point.pressure,
  }))
}

export function fromShodoStroke(points: ShodoStrokePoint[], timeOffset = 0): BrushInputPoint[] {
  return points.map(point => ({
    x: point.X,
    y: point.Y,
    time: timeOffset + point.T,
    pressure: point.P ?? 1,
    hasPressure: point.P !== undefined,
  }))
}

export function replayShodoStroke(
  record: ShodoStrokeRecord | ShodoStrokePoint[],
  options: ReplayShodoStrokeOptions,
): DirtyRect {
  const points = Array.isArray(record) ? record : record.D
  const mode = Array.isArray(record) ? options.mode ?? 'normal' : record.M ?? options.mode ?? 'normal'
  let dirty = empty()

  options.engine.beginStroke(options.context)
  for (const point of fromShodoStroke(points)) {
    for (const dab of options.engine.addPoint(point))
      dirty = union(dirty, rasterizeDab(options.surface, dab, mode))
  }
  for (const dab of options.engine.endStroke())
    dirty = union(dirty, rasterizeDab(options.surface, dab, mode))

  return dirty
}
