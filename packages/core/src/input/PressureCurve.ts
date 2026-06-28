export type PressureCurve = (pressure: number) => number

export type PressureCurvePreset
  = | 'linear'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'

export interface PressureCurvePoint {
  x: number
  y: number
}

export type PressureCurveConfig
  = | PressureCurvePreset
    | PressureCurve
    | PressureCurvePoint[]

export function createPressureCurve(config: PressureCurveConfig = 'linear'): PressureCurve {
  if (typeof config === 'function')
    return pressure => clamp01(config(clamp01(pressure)))

  if (Array.isArray(config))
    return createPointCurve(config)

  switch (config) {
    case 'ease-in':
      return pressure => clamp01(pressure) ** 2
    case 'ease-out':
      return pressure => 1 - (1 - clamp01(pressure)) ** 2
    case 'ease-in-out':
      return (pressure) => {
        const p = clamp01(pressure)
        return p < 0.5
          ? 2 * p * p
          : 1 - ((-2 * p + 2) ** 2) / 2
      }
    case 'linear':
    default:
      return pressure => clamp01(pressure)
  }
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

function createPointCurve(points: PressureCurvePoint[]): PressureCurve {
  if (points.length === 0)
    return createPressureCurve('linear')

  const sorted = points
    .map(point => ({ x: clamp01(point.x), y: clamp01(point.y) }))
    .sort((a, b) => a.x - b.x)

  return (pressure) => {
    const p = clamp01(pressure)
    if (p <= sorted[0]!.x)
      return sorted[0]!.y

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const next = sorted[i]!
      if (p > next.x)
        continue
      const span = next.x - prev.x
      const t = span === 0 ? 0 : (p - prev.x) / span
      return clamp01(lerp(prev.y, next.y, t))
    }

    return sorted.at(-1)!.y
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
