export type MemoryRiskLevel = 'normal' | 'watch' | 'high'

export type MemoryEstimateKind = 'browser' | 'cpu' | 'gpu' | 'undo'

export interface MemoryEstimateEntry {
  id: string
  label: string
  bytes: number
  kind: MemoryEstimateKind
  count?: number
  metadata?: Record<string, boolean | number | string>
}

export interface SurfaceMemorySnapshot {
  source: string
  width: number
  height: number
  totalEstimatedBytes: number
  entries: MemoryEstimateEntry[]
  metadata?: Record<string, boolean | number | string>
}

export interface UndoMemorySnapshot {
  undoCount: number
  redoCount: number
  capacity: number
  totalEstimatedBytes: number
  entries: MemoryEstimateEntry[]
}

export interface BrowserMemorySnapshot {
  source: 'measureUserAgentSpecificMemory' | 'performance.memory'
  bytes: number
  entries: MemoryEstimateEntry[]
  metadata?: Record<string, boolean | number | string>
}

export interface PainterMemorySnapshot {
  totalEstimatedBytes: number
  riskLevel: MemoryRiskLevel
  surface: SurfaceMemorySnapshot
  undo: UndoMemorySnapshot
  browser?: BrowserMemorySnapshot
  deviceMemoryBytes?: number
}
