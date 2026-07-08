import type { TickableBrushEngine } from '../brush'
import type { TiledSurface } from '../surface'
import type {
  BrushContext,
  BrushEngine,
  BrushInputPoint,
  CompositeMode,
  DirtyRect,
  RGBA,
} from '../types'
import type { ShodoStrokePoint, ShodoStrokeRecord } from './shodo'
import { isTickableBrushEngine } from '../brush'
import { empty, union } from '../math'
import { rasterizeDab } from '../surface'

export const SAIER_STROKE_SCHEMA = 'saier.stroke.v1'
export const SAIER_STROKE_LOG_SCHEMA = 'saier.stroke-log.v1'
export const SAIER_OPERATION_SCHEMA = 'saier.operation.v1'

export type SaierPaintTarget = 'layer' | 'mask'
export type SaierStrokeTool = 'brush' | 'eraser'
export type SaierStrokeInputPipeline = 'resolved-v1'

export interface SaierStrokePointEvent {
  kind: 'point'
  /** Stroke-local monotonic time in ms. */
  t: number
  /** Document-space coordinates. */
  x: number
  y: number
  pressure: number
  hasPressure?: boolean
  pointerType?: 'mouse' | 'pen' | 'touch' | string
  tiltX?: number
  tiltY?: number
  twist?: number
}

export interface SaierStrokeTickEvent {
  kind: 'tick'
  /** Stroke-local monotonic time in ms. */
  t: number
}

export type SaierStrokeReplayEvent = SaierStrokePointEvent | SaierStrokeTickEvent

export interface SaierBrushEngineSnapshot {
  id: string
  version: string
  capabilities?: string[]
}

export interface SaierStrokeResultSnapshot {
  dirtyRect: DirtyRect
  /** Stable hash of the committed affected pixels or patch. Diagnostic only. */
  patchHash?: string
}

export interface SaierStrokeCommit {
  schema: typeof SAIER_STROKE_SCHEMA
  id: string
  documentId?: string
  layerId: string
  paintTarget: SaierPaintTarget
  tool: SaierStrokeTool
  compositeMode: CompositeMode
  brushEngine: SaierBrushEngineSnapshot
  brushPresetId: string
  /** Fully resolved preset/options at stroke start. */
  brushPresetSnapshot: unknown
  /** Resolved context handed to `BrushEngine.beginStroke`. */
  brushContextSnapshot: BrushContext
  seed?: string
  inputPipeline: SaierStrokeInputPipeline
  events: SaierStrokeReplayEvent[]
  result?: SaierStrokeResultSnapshot
  metadata?: {
    createdAt?: number
    authorId?: string
    deviceClass?: 'desktop' | 'tablet' | 'mobile'
  }
}

export interface SaierProjectRef {
  schema: 'saier.project-ref.v1'
  revision: number
  url?: string
  embedded?: unknown
  hash?: string
}

export type SaierReplayOperationType
  = | 'stroke:commit'
    | 'document:command'
    | 'layer:command'
    | 'project:snapshot'
    | 'operation:revert'

export interface SaierReplayOperation<TPayload = unknown> {
  schema: typeof SAIER_OPERATION_SCHEMA
  opId: string
  revision?: number
  baseRevision?: number
  type: SaierReplayOperationType
  payload: TPayload
  createdAt?: number
}

export interface SaierStrokeLog {
  schema: typeof SAIER_STROKE_LOG_SCHEMA
  documentId: string
  baseSnapshot?: SaierProjectRef
  operations: SaierReplayOperation[]
}

export interface ReplaySaierStrokeOptions {
  engine: BrushEngine
  surface: TiledSurface
  /**
   * Adds an offset to replay event timestamps. Defaults to `0`; most callers
   * should keep stroke-local time unchanged for deterministic replay.
   */
  timeOffset?: number
}

export interface ReplaySaierStrokeResult {
  dirtyRect: DirtyRect
  patchHash: string
  patchHashMatches?: boolean
}

export interface ShodoToSaierStrokeCommitOptions {
  id: string
  documentId?: string
  layerId?: string
  paintTarget?: SaierPaintTarget
  tool?: SaierStrokeTool
  brushEngine: SaierBrushEngineSnapshot
  brushPresetId: string
  brushPresetSnapshot: unknown
  brushContextSnapshot: BrushContext
  seed?: string
  metadata?: SaierStrokeCommit['metadata']
}

export function toSaierStrokeEvents(points: BrushInputPoint[]): SaierStrokePointEvent[] {
  const start = points[0]?.time ?? 0
  return points.map(point => toSaierStrokePointEvent(point, start))
}

export function fromSaierStrokePointEvent(
  event: SaierStrokePointEvent,
  timeOffset = 0,
): BrushInputPoint {
  return {
    x: event.x,
    y: event.y,
    pressure: event.pressure,
    time: timeOffset + event.t,
    ...(event.hasPressure !== undefined ? { hasPressure: event.hasPressure } : {}),
    ...(event.pointerType !== undefined ? { pointerType: event.pointerType } : {}),
    ...(event.tiltX !== undefined ? { tiltX: event.tiltX } : {}),
    ...(event.tiltY !== undefined ? { tiltY: event.tiltY } : {}),
    ...(event.twist !== undefined ? { twist: event.twist } : {}),
  }
}

export function replaySaierStroke(
  commit: SaierStrokeCommit,
  options: ReplaySaierStrokeOptions,
): ReplaySaierStrokeResult {
  assertSaierStrokeCommit(commit)

  const timeOffset = options.timeOffset ?? 0
  const engine = options.engine
  let dirtyRect = empty()

  engine.beginStroke(commit.brushContextSnapshot)
  for (const event of commit.events) {
    if (event.kind === 'point') {
      dirtyRect = paintDabs(
        options.surface,
        dirtyRect,
        engine.addPoint(fromSaierStrokePointEvent(event, timeOffset)),
        commit.compositeMode,
      )
      continue
    }

    if (!isTickableBrushEngine(engine)) {
      throw new Error(
        `Stroke "${commit.id}" contains tick events but brush engine "${commit.brushEngine.id}" is not tickable`,
      )
    }

    dirtyRect = paintDabs(
      options.surface,
      dirtyRect,
      (engine as TickableBrushEngine).tick(timeOffset + event.t),
      commit.compositeMode,
    )
  }

  dirtyRect = paintDabs(options.surface, dirtyRect, engine.endStroke(), commit.compositeMode)

  const patchHash = hashTiledSurfaceRegion(options.surface, dirtyRect)
  return {
    dirtyRect,
    patchHash,
    ...(commit.result?.patchHash
      ? { patchHashMatches: commit.result.patchHash === patchHash }
      : {}),
  }
}

export function hashTiledSurfaceRegion(surface: TiledSurface, rect: DirtyRect): string {
  let hash = 0x811C9DC5
  hash = fnv1aUint32(hash, rect.x)
  hash = fnv1aUint32(hash, rect.y)
  hash = fnv1aUint32(hash, rect.width)
  hash = fnv1aUint32(hash, rect.height)

  const bytes = surface.readRegion(rect)
  for (const byte of bytes)
    hash = fnv1aByte(hash, byte)

  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}

export function shodoStrokeToSaierStrokeCommit(
  record: ShodoStrokeRecord,
  options: ShodoToSaierStrokeCommitOptions,
): SaierStrokeCommit {
  const compositeMode = record.M ?? 'normal'
  const tool = options.tool ?? (compositeMode === 'erase' ? 'eraser' : 'brush')

  return {
    schema: SAIER_STROKE_SCHEMA,
    id: options.id,
    ...(options.documentId ? { documentId: options.documentId } : {}),
    layerId: options.layerId ?? record.L ?? '',
    paintTarget: options.paintTarget ?? 'layer',
    tool,
    compositeMode,
    brushEngine: cloneBrushEngineSnapshot(options.brushEngine),
    brushPresetId: options.brushPresetId,
    brushPresetSnapshot: options.brushPresetSnapshot,
    brushContextSnapshot: cloneBrushContext(options.brushContextSnapshot),
    ...(options.seed ? { seed: options.seed } : {}),
    inputPipeline: 'resolved-v1',
    events: record.D.map(shodoPointToSaierEvent),
    ...(options.metadata ? { metadata: { ...options.metadata } } : {}),
  }
}

export function saierStrokeCommitToShodo(commit: SaierStrokeCommit): ShodoStrokeRecord {
  assertSaierStrokeCommit(commit)
  const points: ShodoStrokePoint[] = []
  for (const event of commit.events) {
    if (event.kind !== 'point') {
      throw new Error(
        `Cannot convert stroke "${commit.id}" with tick events to legacy shodo format`,
      )
    }
    points.push(saierEventToShodoPoint(event))
  }

  return {
    O: 0,
    ...(commit.layerId ? { L: commit.layerId } : {}),
    ...(commit.compositeMode !== 'normal' ? { M: commit.compositeMode } : {}),
    D: points,
  }
}

function toSaierStrokePointEvent(
  point: BrushInputPoint,
  startTime: number,
): SaierStrokePointEvent {
  return {
    kind: 'point',
    x: point.x,
    y: point.y,
    t: point.time - startTime,
    pressure: point.pressure,
    ...(point.hasPressure !== undefined ? { hasPressure: point.hasPressure } : {}),
    ...(point.pointerType !== undefined ? { pointerType: point.pointerType } : {}),
    ...(point.tiltX !== undefined ? { tiltX: point.tiltX } : {}),
    ...(point.tiltY !== undefined ? { tiltY: point.tiltY } : {}),
    ...(point.twist !== undefined ? { twist: point.twist } : {}),
  }
}

function paintDabs(
  surface: TiledSurface,
  currentDirty: DirtyRect,
  dabs: ReturnType<BrushEngine['addPoint']>,
  mode: CompositeMode,
): DirtyRect {
  let dirty = currentDirty
  for (const dab of dabs)
    dirty = union(dirty, rasterizeDab(surface, dab, mode))
  return dirty
}

export function assertSaierStrokeCommit(value: unknown): asserts value is SaierStrokeCommit {
  const commit = value as Partial<SaierStrokeCommit>
  if (!isSaierStrokeCommit(value))
    throw new Error('Invalid Saier stroke commit')
  if (commit.schema !== SAIER_STROKE_SCHEMA)
    throw new Error(`Unsupported stroke schema: ${commit.schema}`)
  if (commit.inputPipeline !== 'resolved-v1')
    throw new Error(`Unsupported stroke input pipeline: ${commit.inputPipeline}`)
  if (!commit.layerId)
    throw new Error('Cannot replay stroke without a target layerId')
  if (!commit.brushEngine?.id || !commit.brushEngine.version)
    throw new Error('Cannot replay stroke without brushEngine id/version')
  if (!commit.brushPresetId)
    throw new Error('Cannot replay stroke without brushPresetId')
  if (!commit.brushContextSnapshot)
    throw new Error('Cannot replay stroke without brushContextSnapshot')
  if (!commit.brushPresetSnapshot)
    throw new Error('Cannot replay stroke without brushPresetSnapshot')
}

export function isSaierStrokeCommit(value: unknown): value is SaierStrokeCommit {
  const record = asRecord(value)
  if (!record)
    return false

  const brushEngine = asRecord(record.brushEngine)
  const context = asRecord(record.brushContextSnapshot)
  const color = asRecord(context?.color)
  return record.schema === SAIER_STROKE_SCHEMA
    && typeof record.id === 'string'
    && typeof record.layerId === 'string'
    && (record.paintTarget === 'layer' || record.paintTarget === 'mask')
    && (record.tool === 'brush' || record.tool === 'eraser')
    && typeof record.compositeMode === 'string'
    && typeof brushEngine?.id === 'string'
    && typeof brushEngine.version === 'string'
    && typeof record.brushPresetId === 'string'
    && record.brushPresetSnapshot !== undefined
    && Boolean(context)
    && typeof color?.r === 'number'
    && typeof color.g === 'number'
    && typeof color.b === 'number'
    && typeof color.a === 'number'
    && record.inputPipeline === 'resolved-v1'
    && Array.isArray(record.events)
    && record.events.every(isSaierStrokeReplayEvent)
}

function isSaierStrokeReplayEvent(value: unknown): value is SaierStrokeReplayEvent {
  const record = asRecord(value)
  if (!record)
    return false

  if (record.kind === 'tick')
    return typeof record.t === 'number' && Number.isFinite(record.t)

  return record.kind === 'point'
    && typeof record.t === 'number'
    && Number.isFinite(record.t)
    && typeof record.x === 'number'
    && Number.isFinite(record.x)
    && typeof record.y === 'number'
    && Number.isFinite(record.y)
    && typeof record.pressure === 'number'
    && Number.isFinite(record.pressure)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : undefined
}

function shodoPointToSaierEvent(point: ShodoStrokePoint): SaierStrokePointEvent {
  return {
    kind: 'point',
    x: point.X,
    y: point.Y,
    t: point.T,
    pressure: point.P ?? 1,
    hasPressure: point.P !== undefined,
  }
}

function saierEventToShodoPoint(event: SaierStrokePointEvent): ShodoStrokePoint {
  return {
    X: event.x,
    Y: event.y,
    T: event.t,
    ...(event.hasPressure === false ? {} : { P: event.pressure }),
  }
}

function cloneBrushContext(context: BrushContext): BrushContext {
  return {
    ...context,
    color: cloneRGBA(context.color),
  }
}

function cloneBrushEngineSnapshot(snapshot: SaierBrushEngineSnapshot): SaierBrushEngineSnapshot {
  return {
    ...snapshot,
    ...(snapshot.capabilities ? { capabilities: [...snapshot.capabilities] } : {}),
  }
}

function cloneRGBA(color: RGBA): RGBA {
  return { ...color }
}

function fnv1aUint32(hash: number, value: number): number {
  let next = hash
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0
  next = fnv1aByte(next, normalized & 0xFF)
  next = fnv1aByte(next, (normalized >>> 8) & 0xFF)
  next = fnv1aByte(next, (normalized >>> 16) & 0xFF)
  next = fnv1aByte(next, (normalized >>> 24) & 0xFF)
  return next
}

function fnv1aByte(hash: number, byte: number): number {
  return Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0
}
