export type CollaborationMode = 'viewer' | 'driver' | 'multi-editor'
export type ActivityType = 'pictionary'
export type ActiveActivityStatus = 'lobby' | 'running' | 'ending'

export interface ActiveActivity {
  type: ActivityType
  sessionId: string
  activityEpoch: number
  protocolVersion: 1
  status: ActiveActivityStatus
}

export interface SaierCloudRoomActivityMetadata {
  collaborationMode: CollaborationMode
  /** Compatibility field written for one migration window. */
  mode?: CollaborationMode
  roomMetadataRevision: number
  activeActivity?: ActiveActivity
}

export interface ActivityCommand<T = unknown> {
  commandId: string
  sessionId: string
  activityEpoch: number
  roundId?: string
  phaseEpoch?: number
  controllerEpoch?: number
  expectedGameRevision?: number
  payload: T
}

export interface GamePublicEvent<T = unknown> {
  eventId: string
  sessionId: string
  activityEpoch: number
  eventSeq: number
  gameRevision: number
  roundId?: string
  canvasSeq?: number
  rulesVersion: number
  payload: T
}

export interface ResumeCursor {
  roomMetadataRevision: number
  lastEventSeq: number
  roundId?: string
  lastCanvasSeq?: number
  privateProjectionRevision?: number
}

export interface ActivityWatermark {
  roomMetadataRevision: number
  eventSeq: number
  roundId?: string
  canvasSeq?: number
  privateProjectionRevision: number
}

export type ActivityTransportState
  = | 'connecting'
    | 'realtime'
    | 'reconnecting'
    | 'degraded-polling'
    | 'resyncing'
    | 'recovered'
    | 'fatal'

export interface ActivityCanvasOperation<T = unknown> {
  operationId: string
  sessionId: string
  activityEpoch: number
  roundId: string
  phaseEpoch: number
  controllerEpoch: number
  strokeId: string
  canvasSeq: number
  payload: T
}

export interface ActivitySnapshot<TState = unknown, TCanvas = unknown> {
  state: TState
  canvas: TCanvas
  snapshotEventSeq: number
  roundId?: string
  snapshotCanvasSeq?: number
}

export type ResumeResponse<TEvent = unknown, TCanvas = unknown, TState = unknown>
  = | {
    kind: 'DELTA'
    events: Array<GamePublicEvent<TEvent>>
    canvasOperations: Array<ActivityCanvasOperation<TCanvas>>
    state: TState
    watermark: ActivityWatermark
  }
  | {
    kind: 'SNAPSHOT_REQUIRED'
    snapshot: ActivitySnapshot<TState, TCanvas>
    watermark: ActivityWatermark
  }
  | {
    kind: 'SESSION_ENDED'
    endedAt?: number
  }
  | {
    kind: 'RESYNC_REQUIRED'
    reason: 'ACTIVITY_EPOCH_MISMATCH' | 'ROUND_MISMATCH' | 'CURSOR_AHEAD' | 'INVALID_CURSOR'
    watermark: ActivityWatermark
  }

export interface Clock {
  now: () => number
}

export interface RandomSource {
  /** Returns a value in [0, 1). */
  next: () => number
}

export interface IdGenerator {
  next: (prefix: string) => string
}

export function readCollaborationMode(room: {
  collaborationMode?: unknown
  mode?: unknown
}): CollaborationMode {
  return parseCollaborationMode(room.collaborationMode)
    ?? parseCollaborationMode(room.mode)
    ?? 'viewer'
}

export function createCollaborationModeMigrationPatch(
  mode: CollaborationMode,
  roomMetadataRevision: number,
): Pick<SaierCloudRoomActivityMetadata, 'collaborationMode' | 'mode' | 'roomMetadataRevision'> {
  assertNonNegativeInteger(roomMetadataRevision, 'roomMetadataRevision')
  return {
    collaborationMode: mode,
    mode,
    roomMetadataRevision: roomMetadataRevision + 1,
  }
}

export function createActiveActivity(
  currentEpoch: number,
  input: Omit<ActiveActivity, 'activityEpoch' | 'protocolVersion'>,
): ActiveActivity {
  assertNonNegativeInteger(currentEpoch, 'activityEpoch')
  if (!input.sessionId.trim())
    throw new TypeError('sessionId is required.')
  return {
    ...input,
    activityEpoch: currentEpoch + 1,
    protocolVersion: 1,
  }
}

export function matchesActiveActivity(
  activeActivity: ActiveActivity | undefined,
  fence: Pick<ActiveActivity, 'sessionId' | 'activityEpoch'>,
): boolean {
  return activeActivity?.sessionId === fence.sessionId
    && activeActivity.activityEpoch === fence.activityEpoch
}

export function assertActivityCommandEnvelope(command: ActivityCommand): void {
  if (!command.commandId.trim() || !command.sessionId.trim())
    throw new TypeError('commandId and sessionId are required.')
  assertPositiveInteger(command.activityEpoch, 'activityEpoch')
  optionalPositiveInteger(command.phaseEpoch, 'phaseEpoch')
  optionalPositiveInteger(command.controllerEpoch, 'controllerEpoch')
  optionalNonNegativeInteger(command.expectedGameRevision, 'expectedGameRevision')
}

function parseCollaborationMode(value: unknown): CollaborationMode | undefined {
  return value === 'viewer' || value === 'driver' || value === 'multi-editor'
    ? value
    : undefined
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative integer.`)
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`)
}

function optionalPositiveInteger(value: number | undefined, name: string): void {
  if (value !== undefined)
    assertPositiveInteger(value, name)
}

function optionalNonNegativeInteger(value: number | undefined, name: string): void {
  if (value !== undefined)
    assertNonNegativeInteger(value, name)
}
