import type { ActivityCommand, ActivityType } from './protocol'

export const ACTIVITY_UI_SLOTS = [
  'room-toolbar',
  'room-sidebar',
  'canvas-overlay',
  'mobile-sheet',
] as const

export type ActivityUiSlot = typeof ACTIVITY_UI_SLOTS[number]
export type ActivityTool = 'pen' | 'marker' | 'eraser'

export interface ActivityInteractionPolicy {
  canDraw: boolean
  canGuess: boolean
  tools: readonly ActivityTool[]
}

export interface ActivityCanvasState {
  readonly width: 1024
  readonly height: 768
  readonly roundId: string
  readonly canvasSeq: number
}

declare const activityDocumentBrand: unique symbol

export interface ActivityDocument {
  readonly [activityDocumentBrand]: true
  readonly id: string
  readonly sessionId: string
  readonly activityEpoch: number
  readonly roundId: string
  readonly width: 1024
  readonly height: 768
  readonly layers: readonly [{ readonly id: 'layer-1', readonly type: 'raster' }]
}

export interface ActivityCanvasDispatch {
  type: 'stroke:commit' | 'canvas:clear'
  sessionId: string
  activityEpoch: number
  roundId: string
  controllerEpoch: number
  payload: unknown
}

export interface ActivityStrokeObservation {
  sessionId: string
  activityEpoch: number
  roundId: string
  controllerEpoch: number
  strokeId: string
  payload: unknown
}

export interface ActivityCanvasFacade {
  state: {
    read: () => Readonly<ActivityCanvasState>
  }
  dispatch: (command: ActivityCanvasDispatch) => Promise<void>
  stroke: {
    observe: (listener: (event: ActivityStrokeObservation) => void) => () => void
  }
}

export interface ActivitySessionStorage {
  readonly maxBytes: number
  clear: () => void
  delete: (key: string) => void
  get: <T>(key: string) => T | undefined
  set: (key: string, value: unknown) => void
  sizeBytes: () => number
}

export interface RoomActivityHostFacade {
  activityCanvas: ActivityCanvasFacade
  command: {
    submit: <T>(command: ActivityCommand<T>) => Promise<unknown>
  }
  interactionPolicy: Readonly<ActivityInteractionPolicy>
  storage: {
    session: ActivitySessionStorage
  }
  ui: {
    register: (slot: ActivityUiSlot, render: () => unknown) => () => void
  }
}

export interface RoomActivityManifest {
  type: ActivityType
  protocolVersion: 1
  title: string
  requestedTools: readonly ActivityTool[]
  requestedSlots: readonly ActivityUiSlot[]
}

export interface RoomActivityExtension {
  manifest: RoomActivityManifest
  activate: (host: Readonly<RoomActivityHostFacade>) => void | Promise<void>
  dispose: () => void | Promise<void>
}

export function intersectInteractionPolicy(
  host: ActivityInteractionPolicy,
  authoritative: ActivityInteractionPolicy,
  requested: Partial<ActivityInteractionPolicy>,
): Readonly<ActivityInteractionPolicy> {
  const requestedTools = new Set(requested.tools ?? host.tools)
  const authoritativeTools = new Set(authoritative.tools)
  const tools = host.tools.filter(tool => authoritativeTools.has(tool) && requestedTools.has(tool))
  return Object.freeze({
    canDraw: host.canDraw && authoritative.canDraw && requested.canDraw !== false,
    canGuess: host.canGuess && authoritative.canGuess && requested.canGuess !== false,
    tools: Object.freeze(tools),
  })
}

export function freezeActivityHostFacade(facade: RoomActivityHostFacade): Readonly<RoomActivityHostFacade> {
  Object.freeze(facade.activityCanvas.state)
  Object.freeze(facade.activityCanvas.stroke)
  Object.freeze(facade.activityCanvas)
  Object.freeze(facade.command)
  Object.freeze(facade.storage)
  Object.freeze(facade.ui)
  return Object.freeze(facade)
}

export function createActivitySessionStorage(maxBytes = 64 * 1024): ActivitySessionStorage {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new TypeError('maxBytes must be a positive integer.')
  const entries = new Map<string, unknown>()

  const storage: ActivitySessionStorage = {
    maxBytes,
    clear: () => entries.clear(),
    delete: key => void entries.delete(key),
    get: <T>(key: string) => cloneJson(entries.get(key)) as T | undefined,
    set(key, value) {
      assertStorageKey(key)
      const cloned = cloneJson(value)
      const candidate = new Map(entries)
      candidate.set(key, cloned)
      const bytes = byteLength(Array.from(candidate.entries()))
      if (bytes > maxBytes)
        throw new RangeError(`Activity session storage exceeds ${maxBytes} bytes.`)
      entries.set(key, cloned)
    },
    sizeBytes: () => byteLength(Array.from(entries.entries())),
  }
  return Object.freeze(storage)
}

export function createActivityDocument(input: {
  sessionId: string
  activityEpoch: number
  roundId: string
}): ActivityDocument {
  if (!input.sessionId.trim() || !input.roundId.trim())
    throw new TypeError('Activity documents require sessionId and roundId.')
  if (!Number.isSafeInteger(input.activityEpoch) || input.activityEpoch < 1)
    throw new TypeError('Activity documents require a positive activityEpoch.')
  return Object.freeze({
    id: `activity:${input.activityEpoch}:${encodeURIComponent(input.sessionId)}:${encodeURIComponent(input.roundId)}`,
    sessionId: input.sessionId,
    activityEpoch: input.activityEpoch,
    roundId: input.roundId,
    width: 1024,
    height: 768,
    layers: Object.freeze([Object.freeze({ id: 'layer-1', type: 'raster' })]),
  }) as ActivityDocument
}

function assertStorageKey(key: string): void {
  const normalized = key.trim()
  if (!normalized || normalized.length > 128)
    throw new TypeError('Activity session storage keys must contain 1-128 characters.')
  if (/answer|candidate|secret|wordbank/i.test(normalized))
    throw new TypeError('Secrets are not allowed in activity session storage.')
}

function cloneJson(value: unknown): unknown {
  if (value === undefined)
    return undefined
  const encoded = JSON.stringify(value)
  if (encoded === undefined)
    throw new TypeError('Activity session storage only accepts JSON values.')
  return JSON.parse(encoded) as unknown
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}
