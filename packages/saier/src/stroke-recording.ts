import type {
  BrushDab,
  BrushEngine,
  BrushEngineFromPresetOptions,
  BrushInputPoint,
  BrushPreset,
  CompositeMode,
  SaierStrokeCommit,
  SaierStrokeLog,
  SaierStrokeReplayEvent,
  SaierStrokeTool,
  StrokePatch,
  TiledSurface,
} from '@saier/core'
import type { Painter } from './painter'
import {
  clonePreset,
  createBrushEngineFromPreset,
  empty,
  fromCircle,
  hashTiledSurfaceRegion,
  isEmpty,
  isSmudgeBrushEngine,
  isTickableBrushEngine,
  SAIER_OPERATION_SCHEMA,
  SAIER_STROKE_LOG_SCHEMA,
  SAIER_STROKE_SCHEMA,
  SimpleBrushEngine,
  union,
} from '@saier/core'
import { toLayerLocalDab } from './utils/transform'

const BUILTIN_ENGINE_VERSION = '0.1.6-beta.1'

export interface PainterBrushStrokeSnapshot {
  kind: 'brush'
  preset: BrushPreset
  options: BrushEngineFromPresetOptions
}

export interface PainterEraserStrokeSnapshot {
  kind: 'eraser'
  options: {
    pressureFallback: 'velocity' | 'none'
  }
}

export type PainterStrokePresetSnapshot = PainterBrushStrokeSnapshot | PainterEraserStrokeSnapshot

export interface BeginPainterStrokeRecordingOptions {
  layerId: string
  tool: SaierStrokeTool
  compositeMode: CompositeMode
  brushEngineId: string
  brushPresetId: string
  brushPresetSnapshot: PainterStrokePresetSnapshot
  brushContextSnapshot: SaierStrokeCommit['brushContextSnapshot']
}

export interface ReplayPainterStrokeOptions {
  recordHistory?: boolean
}

export interface ReplayPainterStrokeTimedOptions extends ReplayPainterStrokeOptions {
  /** Playback speed multiplier. Values greater than 1 replay faster. */
  speed?: number
  /** Cancels an in-progress preview replay. */
  signal?: AbortSignal
}

export interface ExportPainterStrokeLogOptions {
  documentId?: string
}

export interface ImportPainterStrokeLogOptions {
  documentId?: string
  layerIdFallback?: string
  replace?: boolean
}

interface ActivePainterStroke {
  id: string
  documentId: string
  layerId: string
  paintTarget: SaierStrokeCommit['paintTarget']
  tool: SaierStrokeTool
  pointCount: number
  previewEnabled: boolean
  shouldStore: boolean
  startTime: number | null
  commit: SaierStrokeCommit | null
}

export class PainterStrokeRecording {
  private enabled = false
  private readonly strokes: SaierStrokeCommit[] = []
  private active: ActivePainterStroke | null = null
  private strokeCounter = 0
  private replaying = false

  constructor(private readonly painter: Painter) {}

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled)
      this.cancelActiveStroke()
  }

  getStrokes(): SaierStrokeCommit[] {
    return this.strokes.map(cloneStrokeCommit)
  }

  getLog(options: ExportPainterStrokeLogOptions = {}): SaierStrokeLog {
    const documentId = options.documentId ?? this.painter.getActiveDocumentId()
    const strokes = options.documentId
      ? this.strokes.filter(stroke => stroke.documentId === options.documentId)
      : this.strokes
    return {
      schema: SAIER_STROKE_LOG_SCHEMA,
      documentId,
      operations: strokes.map((stroke, index) => ({
        schema: SAIER_OPERATION_SCHEMA,
        opId: stroke.id,
        revision: index + 1,
        type: 'stroke:commit',
        payload: cloneStrokeCommit(stroke),
      })),
    }
  }

  clear(): void {
    this.strokes.length = 0
    this.active = null
    this.strokeCounter = 0
  }

  beginStroke(options: BeginPainterStrokeRecordingOptions): void {
    if (this.replaying)
      return

    const id = `stroke-${++this.strokeCounter}`
    const documentId = this.painter.getActiveDocumentId()
    const paintTarget = this.painter.paintTarget === 'mask' ? 'mask' : 'layer'
    const captureFullCommit = this.enabled || this.hasListeners('stroke:commit') || this.hasListeners('stroke:committed')
    const commit: SaierStrokeCommit | null = captureFullCommit
      ? {
          schema: SAIER_STROKE_SCHEMA,
          id,
          documentId,
          layerId: options.layerId,
          paintTarget,
          tool: options.tool,
          compositeMode: options.compositeMode,
          brushEngine: {
            id: options.brushEngineId,
            version: BUILTIN_ENGINE_VERSION,
          },
          brushPresetId: options.brushPresetId,
          brushPresetSnapshot: cloneStrokePresetSnapshot(options.brushPresetSnapshot),
          brushContextSnapshot: {
            ...options.brushContextSnapshot,
            color: { ...options.brushContextSnapshot.color },
          },
          inputPipeline: 'resolved-v1',
          events: [],
        }
      : null
    this.active = {
      id,
      documentId,
      layerId: options.layerId,
      paintTarget,
      tool: options.tool,
      pointCount: 0,
      previewEnabled: this.hasListeners('stroke:preview'),
      shouldStore: this.enabled,
      startTime: null,
      commit,
    }
  }

  recordPoint(point: BrushInputPoint): void {
    if (!this.active)
      return

    this.active.pointCount++
    const commit = this.active.commit
    if (commit) {
      const start = this.active.startTime ?? point.time
      this.active.startTime = start
      commit.events.push({
        kind: 'point',
        x: point.x,
        y: point.y,
        t: point.time - start,
        pressure: point.pressure,
        ...(point.hasPressure !== undefined ? { hasPressure: point.hasPressure } : {}),
        ...(point.pointerType !== undefined ? { pointerType: point.pointerType } : {}),
        ...(point.tiltX !== undefined ? { tiltX: point.tiltX } : {}),
        ...(point.tiltY !== undefined ? { tiltY: point.tiltY } : {}),
        ...(point.twist !== undefined ? { twist: point.twist } : {}),
      })
    }
    if (this.active.previewEnabled)
      this.painter.emitStrokePreview(this.active.id, this.active.layerId, this.active.pointCount, point)
  }

  recordTick(time: number): void {
    if (!this.active?.commit || this.active.startTime === null)
      return

    this.active.commit.events.push({
      kind: 'tick',
      t: time - this.active.startTime,
    })
  }

  commitStroke(patch: StrokePatch): SaierStrokeCommit | null {
    const active = this.active
    this.active = null

    if (!active || isEmpty(patch.rect) || active.pointCount === 0)
      return null
    if (active.tool === 'eraser' && !patchChangesPixels(patch))
      return null

    const commit = active.commit
    let committed: SaierStrokeCommit | null = null
    if (commit) {
      commit.result = {
        dirtyRect: { ...patch.rect },
        ...this.createPatchHash(active.layerId, patch.rect),
      }
      committed = cloneStrokeCommit(commit)
      if (active.shouldStore)
        this.strokes.push(cloneStrokeCommit(committed))
    }

    this.painter.emitStrokeCommitted(active, patch, committed)
    return committed
  }

  cancelActiveStroke(): void {
    this.active = null
  }

  importLog(log: SaierStrokeLog, options: ImportPainterStrokeLogOptions = {}): number {
    assertStrokeLog(log)
    if (options.replace)
      this.clear()

    const documentId = options.documentId ?? log.documentId
    const imported: SaierStrokeCommit[] = []
    for (const operation of log.operations) {
      if (operation.type !== 'stroke:commit')
        continue

      assertStrokeCommit(operation.payload)
      const commit = cloneStrokeCommit(operation.payload)
      commit.documentId = documentId
      if (options.layerIdFallback && !this.painter.document.getLayer(commit.layerId))
        commit.layerId = options.layerIdFallback
      imported.push(commit)
    }

    this.strokes.push(...imported)
    this.strokeCounter += imported.length
    return imported.length
  }

  replayStroke(commit: SaierStrokeCommit, options: ReplayPainterStrokeOptions = {}): StrokePatch {
    if (commit.schema !== SAIER_STROKE_SCHEMA)
      throw new Error(`Unsupported stroke schema: ${commit.schema}`)

    const engine = this.createEngine(commit)
    let dirty = empty()
    this.replaying = true

    try {
      this.painter.surface.beginStroke(commit.layerId)
      engine.beginStroke(commit.brushContextSnapshot)
      for (const event of commit.events)
        dirty = union(dirty, this.replayEvent(commit, engine, event))
      dirty = union(dirty, this.paintDabs(commit, engine, engine.endStroke()))

      const patch = this.painter.surface.endStroke(commit.layerId)
      if (options.recordHistory !== false)
        this.painter.recordStrokePatch(patch)
      else
        this.painter.refreshDerivedDisplays(dirty)
      return patch
    }
    finally {
      this.replaying = false
    }
  }

  /**
   * Replays one stroke according to its stroke-local event timestamps.
   *
   * This is intended for isolated preview painters. Regular document restore
   * should continue to use the synchronous {@link replayStroke} path.
   */
  async replayStrokeTimed(
    commit: SaierStrokeCommit,
    options: ReplayPainterStrokeTimedOptions = {},
  ): Promise<StrokePatch> {
    if (commit.schema !== SAIER_STROKE_SCHEMA)
      throw new Error(`Unsupported stroke schema: ${commit.schema}`)

    const speed = normalizeReplaySpeed(options.speed)
    const engine = this.createEngine(commit)
    let dirty = empty()
    let strokeOpen = false
    this.replaying = true

    try {
      throwIfReplayAborted(options.signal)
      this.painter.surface.beginStroke(commit.layerId)
      strokeOpen = true
      engine.beginStroke(commit.brushContextSnapshot)

      let previousTime = 0
      for (const event of commit.events) {
        await waitForReplayDelay((event.t - previousTime) / speed, options.signal)
        previousTime = event.t
        dirty = union(dirty, this.replayEvent(commit, engine, event))
        this.painter.flushSurfaceUploads()
      }

      throwIfReplayAborted(options.signal)
      dirty = union(dirty, this.paintDabs(commit, engine, engine.endStroke()))
      const patch = this.painter.surface.endStroke(commit.layerId)
      strokeOpen = false
      if (options.recordHistory !== false)
        this.painter.recordStrokePatch(patch)
      else
        this.painter.refreshDerivedDisplays(dirty)
      this.painter.flushSurfaceUploads()
      return patch
    }
    catch (error) {
      if (strokeOpen) {
        this.painter.surface.endStroke(commit.layerId)
        this.painter.refreshDerivedDisplays(dirty)
        this.painter.flushSurfaceUploads()
      }
      throw error
    }
    finally {
      this.replaying = false
    }
  }

  replayLog(log: SaierStrokeLog, options: ReplayPainterStrokeOptions = {}): StrokePatch[] {
    const patches: StrokePatch[] = []
    for (const operation of log.operations) {
      if (operation.type !== 'stroke:commit')
        continue
      patches.push(this.replayStroke(operation.payload as SaierStrokeCommit, options))
    }
    return patches
  }

  private hasListeners(type: 'stroke:commit' | 'stroke:committed' | 'stroke:preview'): boolean {
    return (this.painter.emitter.all.get(type)?.length ?? 0) > 0
  }

  private replayEvent(
    commit: SaierStrokeCommit,
    engine: BrushEngine,
    event: SaierStrokeReplayEvent,
  ) {
    if (event.kind === 'point') {
      return this.paintDabs(commit, engine, engine.addPoint({
        x: event.x,
        y: event.y,
        pressure: event.pressure,
        time: event.t,
        ...(event.hasPressure !== undefined ? { hasPressure: event.hasPressure } : {}),
        ...(event.pointerType !== undefined ? { pointerType: event.pointerType } : {}),
        ...(event.tiltX !== undefined ? { tiltX: event.tiltX } : {}),
        ...(event.tiltY !== undefined ? { tiltY: event.tiltY } : {}),
        ...(event.twist !== undefined ? { twist: event.twist } : {}),
      }))
    }

    if (!isTickableBrushEngine(engine)) {
      throw new Error(
        `Stroke "${commit.id}" contains tick events but brush engine "${commit.brushEngine.id}" is not tickable`,
      )
    }
    return this.paintDabs(commit, engine, engine.tick(event.t))
  }

  private paintDabs(commit: SaierStrokeCommit, engine: BrushEngine, dabs: BrushDab[]) {
    let dirty = empty()
    const transform = this.painter.document.getLayer(commit.layerId)?.transform
    for (const dab of dabs) {
      const localDab = toLayerLocalDab(dab, transform)

      if (isSmudgeBrushEngine(engine)) {
        const sampleRegion = this.painter.surface.sampleRegion
        if (!sampleRegion)
          throw new Error('Smudge replay requires a surface backend with sampleRegion')

        const sample = sampleRegion.call(
          this.painter.surface,
          commit.layerId,
          fromCircle(localDab.x, localDab.y, localDab.radius),
          { dab: localDab },
        )
        this.painter.surface.paintDab(commit.layerId, engine.prepareDab(localDab, sample), 'normal')
      }
      else {
        this.paintDabWithEngine(commit, localDab)
      }
      dirty = union(dirty, fromCircle(localDab.x, localDab.y, localDab.radius))
    }
    return dirty
  }

  private paintDabWithEngine(commit: SaierStrokeCommit, dab: BrushDab): void {
    if (commit.tool === 'eraser') {
      this.painter.surface.paintDab(commit.layerId, dab, 'erase')
      return
    }

    this.painter.surface.paintDab(commit.layerId, dab, commit.compositeMode)
  }

  private createEngine(commit: SaierStrokeCommit): BrushEngine {
    const snapshot = commit.brushPresetSnapshot as Partial<PainterStrokePresetSnapshot>
    if (snapshot.kind === 'eraser')
      return new SimpleBrushEngine(snapshot.options)

    if (snapshot.kind === 'brush' && snapshot.preset) {
      return createBrushEngineFromPreset(
        snapshot.preset,
        snapshot.options ?? {},
        this.painter.brushEngineRegistry,
      )
    }

    const preset = this.painter.brushRegistry.require(commit.brushPresetId)
    return createBrushEngineFromPreset(preset, {}, this.painter.brushEngineRegistry)
  }

  private createPatchHash(layerId: string, rect: StrokePatch['rect']): Pick<NonNullable<SaierStrokeCommit['result']>, 'patchHash'> {
    const surface = readSurface(this.painter.surface, layerId)
    if (!surface)
      return {}
    return {
      patchHash: hashTiledSurfaceRegion(surface, rect),
    }
  }
}

function normalizeReplaySpeed(speed = 1): number {
  if (!Number.isFinite(speed) || speed <= 0)
    return 1
  return speed
}

function throwIfReplayAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted)
    return
  const error = new Error('Stroke replay aborted')
  error.name = 'AbortError'
  throw error
}

function waitForReplayDelay(delay: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfReplayAborted(signal)
  const duration = Math.max(0, Math.round(delay))
  if (duration === 0)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      const error = new Error('Stroke replay aborted')
      error.name = 'AbortError'
      reject(error)
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, duration)
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function readSurface(surface: unknown, layerId: string): TiledSurface | undefined {
  if (!surface || typeof surface !== 'object' || !('getSurface' in surface))
    return undefined
  const getter = (surface as { getSurface?: (id: string) => TiledSurface }).getSurface
  return getter?.call(surface, layerId)
}

function patchChangesPixels(patch: StrokePatch): boolean {
  if (Array.isArray(patch.before)) {
    return patch.before.some(tile => !bytesEqual(tile.before, tile.after))
  }
  if (patch.before instanceof Uint8Array && patch.after instanceof Uint8Array)
    return !bytesEqual(patch.before, patch.after)
  return true
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length)
    return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index])
      return false
  }
  return true
}

function cloneStrokePresetSnapshot(snapshot: PainterStrokePresetSnapshot): PainterStrokePresetSnapshot {
  if (snapshot.kind === 'eraser') {
    return {
      kind: 'eraser',
      options: { ...snapshot.options },
    }
  }

  return {
    kind: 'brush',
    preset: clonePreset(snapshot.preset),
    options: { ...snapshot.options },
  }
}

function cloneStrokeCommit(commit: SaierStrokeCommit): SaierStrokeCommit {
  return {
    ...commit,
    brushEngine: {
      ...commit.brushEngine,
      ...(commit.brushEngine.capabilities ? { capabilities: [...commit.brushEngine.capabilities] } : {}),
    },
    brushContextSnapshot: {
      ...commit.brushContextSnapshot,
      color: { ...commit.brushContextSnapshot.color },
    },
    brushPresetSnapshot: cloneMaybeStrokePresetSnapshot(commit.brushPresetSnapshot),
    events: commit.events.map(event => ({ ...event })),
    ...(commit.result
      ? {
          result: {
            dirtyRect: { ...commit.result.dirtyRect },
            ...(commit.result.patchHash ? { patchHash: commit.result.patchHash } : {}),
          },
        }
      : {}),
    ...(commit.metadata ? { metadata: { ...commit.metadata } } : {}),
  }
}

function cloneMaybeStrokePresetSnapshot(snapshot: unknown): unknown {
  if (isStrokePresetSnapshot(snapshot))
    return cloneStrokePresetSnapshot(snapshot)
  return snapshot
}

function assertStrokeLog(log: SaierStrokeLog): void {
  if (!log || log.schema !== SAIER_STROKE_LOG_SCHEMA || !Array.isArray(log.operations))
    throw new Error('Invalid Saier stroke log')
}

function assertStrokeCommit(value: unknown): asserts value is SaierStrokeCommit {
  const commit = value as Partial<SaierStrokeCommit>
  if (!commit || commit.schema !== SAIER_STROKE_SCHEMA || !commit.layerId || !Array.isArray(commit.events))
    throw new Error('Invalid Saier stroke commit')
}

function isStrokePresetSnapshot(snapshot: unknown): snapshot is PainterStrokePresetSnapshot {
  return Boolean(
    snapshot
    && typeof snapshot === 'object'
    && 'kind' in snapshot
    && ((snapshot as { kind?: unknown }).kind === 'brush' || (snapshot as { kind?: unknown }).kind === 'eraser'),
  )
}
