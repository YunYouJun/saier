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

export interface ExportPainterStrokeLogOptions {
  documentId?: string
}

export interface ImportPainterStrokeLogOptions {
  documentId?: string
  layerIdFallback?: string
  replace?: boolean
}

export class PainterStrokeRecording {
  private enabled = false
  private readonly strokes: SaierStrokeCommit[] = []
  private active: SaierStrokeCommit | null = null
  private activeShouldStore = false
  private strokeCounter = 0
  private startTime: number | null = null
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
    this.activeShouldStore = false
    this.startTime = null
    this.strokeCounter = 0
  }

  beginStroke(options: BeginPainterStrokeRecordingOptions): void {
    if (this.replaying)
      return

    this.startTime = null
    this.activeShouldStore = this.enabled
    this.active = {
      schema: SAIER_STROKE_SCHEMA,
      id: `stroke-${++this.strokeCounter}`,
      documentId: this.painter.getActiveDocumentId(),
      layerId: options.layerId,
      paintTarget: this.painter.paintTarget === 'mask' ? 'mask' : 'layer',
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
  }

  recordPoint(point: BrushInputPoint): void {
    if (!this.active)
      return

    const start = this.startTime ?? point.time
    this.startTime = start
    this.active.events.push({
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

  recordTick(time: number): void {
    if (!this.active || this.startTime === null)
      return

    this.active.events.push({
      kind: 'tick',
      t: time - this.startTime,
    })
  }

  commitStroke(patch: StrokePatch): SaierStrokeCommit | null {
    const active = this.active
    const shouldStore = this.activeShouldStore
    this.active = null
    this.activeShouldStore = false
    this.startTime = null

    if (!active || isEmpty(patch.rect) || active.events.length === 0)
      return null

    active.result = {
      dirtyRect: { ...patch.rect },
      ...this.createPatchHash(active.layerId, patch.rect),
    }
    const committed = cloneStrokeCommit(active)
    if (shouldStore)
      this.strokes.push(committed)
    this.painter.emitter.emit('stroke:commit', cloneStrokeCommit(committed))
    return committed
  }

  cancelActiveStroke(): void {
    this.active = null
    this.activeShouldStore = false
    this.startTime = null
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

  replayLog(log: SaierStrokeLog, options: ReplayPainterStrokeOptions = {}): StrokePatch[] {
    const patches: StrokePatch[] = []
    for (const operation of log.operations) {
      if (operation.type !== 'stroke:commit')
        continue
      patches.push(this.replayStroke(operation.payload as SaierStrokeCommit, options))
    }
    return patches
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

function readSurface(surface: unknown, layerId: string): TiledSurface | undefined {
  if (!surface || typeof surface !== 'object' || !('getSurface' in surface))
    return undefined
  const getter = (surface as { getSurface?: (id: string) => TiledSurface }).getSurface
  return getter?.call(surface, layerId)
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
