import type { BrushInputPoint } from '../types'

export const SHODO_OPERATION = {
  STROKE: 0,
  SET_BRUSH: 1,
  SET_INK: 2,
  SET_COLOR: 3,
} as const

export type ShodoOperation = typeof SHODO_OPERATION[keyof typeof SHODO_OPERATION]

export interface ShodoStrokePoint {
  X: number
  Y: number
  T: number
  P?: number
}

export interface ShodoStrokeRecord {
  O: typeof SHODO_OPERATION.STROKE
  D: ShodoStrokePoint[]
}

export interface ShodoHistory {
  v: string
  dpi: number
  pv: number
  w: number
  h: number
  sh: ShodoStrokeRecord[]
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
