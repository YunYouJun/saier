import type { Room } from '@colyseus/sdk'
import type {
  PictionaryCommandType,
  PictionaryPublicState,
} from '@saier/collaboration'

import { Client } from '@colyseus/sdk'
import { readonly, shallowRef } from 'vue'

interface PlayTicket {
  realtimeUrl: string
  roomType: 'pictionary_room'
  sessionId: string
  ticket: string
}

interface PictionaryCommand {
  activityEpoch: number
  commandId: string
  controllerEpoch?: number
  expectedGameRevision?: number
  payload: Record<string, unknown>
  phaseEpoch?: number
  roundId?: string
  sessionId: string
  type: PictionaryCommandType
}

interface PictionaryResumeCursor {
  lastCanvasSeq?: number
  lastEventSeq: number
  privateProjectionRevision?: number
  roomMetadataRevision: number
  roundId?: string
}

interface PictionaryPrivateProjection {
  answer?: string
  candidates?: string[]
  phase: PictionaryPublicState['phase']
  privateProjectionRevision: number
  roundId?: string
  sessionId: string
}

type PictionaryResumeResult
  = | { kind: 'SESSION_ENDED', endedAt?: number }
    | { kind: 'SNAPSHOT_REQUIRED', snapshot: Record<string, any> }
    | { kind: 'DELTA', canvasOperations: unknown[], events: unknown[], state: PictionaryPublicState }

interface PictionaryPlayTransportOptions {
  onProjection: (projection: PictionaryPrivateProjection) => void
  onState: (state: PictionaryPublicState) => void
}

interface PendingResponse {
  reject: (reason: Error) => void
  resolve: (value: any) => void
  timer: ReturnType<typeof setTimeout>
}

type TransportState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export function usePictionaryPlayTransport(options: PictionaryPlayTransportOptions) {
  const connectionId = shallowRef<string>()
  const state = shallowRef<TransportState>('idle')
  const pending = new Map<string, PendingResponse>()
  let room: Room | undefined
  let connecting: Promise<void> | undefined
  let connectedSessionId = ''

  async function connect(credentials: PlayTicket): Promise<void> {
    if (room && connectedSessionId === credentials.sessionId)
      return
    if (connecting) {
      await connecting
      if (room && connectedSessionId === credentials.sessionId)
        return
    }
    connecting = open(credentials)
    try {
      await connecting
    }
    finally {
      connecting = undefined
    }
  }

  async function open(credentials: PlayTicket): Promise<void> {
    await disconnect()
    state.value = 'connecting'
    const client = new Client(credentials.realtimeUrl)
    const joined = await client.joinOrCreate(credentials.roomType, {
      sessionId: credentials.sessionId,
      ticket: credentials.ticket,
    })
    room = joined
    connectedSessionId = credentials.sessionId
    registerRoomMessages(joined)
    state.value = 'connected'
    joined.send('pictionary.sync')
  }

  function registerRoomMessages(current: Room): void {
    current.onMessage('pictionary.ready', (message: unknown) => {
      if (!isRecord(message))
        return
      connectionId.value = stringValue(message.connectionId)
      applyState(message.state)
      applyProjection(message.projection)
    })
    current.onMessage('pictionary.committed', (message: unknown) => {
      if (isRecord(message))
        applyState(message.state)
    })
    current.onMessage('pictionary.private', applyProjection)
    current.onMessage('pictionary.result', (message: unknown) => {
      settle(stringField(message, 'commandId'), message, 'result')
    })
    current.onMessage('pictionary.resume-result', (message: unknown) => {
      settle(stringField(message, 'requestId'), message, 'result')
    })
    current.onMessage('pictionary.projection-result', (message: unknown) => {
      settle(stringField(message, 'requestId'), message, 'projection')
    })
    current.onLeave(() => {
      if (room !== current)
        return
      room = undefined
      connectedSessionId = ''
      connectionId.value = undefined
      state.value = 'disconnected'
      rejectPending(new Error('pictionary_transport_disconnected'))
    })
    current.onError((_code, message) => {
      rejectPending(new Error(message || 'pictionary_transport_error'))
    })
  }

  async function submit(command: PictionaryCommand): Promise<unknown> {
    return request('pictionary.command', command.commandId, command)
  }

  function isConnected(sessionId: string): boolean {
    return Boolean(room && state.value === 'connected' && connectedSessionId === sessionId)
  }

  async function resume(cursor: PictionaryResumeCursor): Promise<PictionaryResumeResult> {
    const requestId = crypto.randomUUID()
    return await request('pictionary.resume', requestId, { cursor, requestId }) as PictionaryResumeResult
  }

  async function getPrivateProjection(): Promise<PictionaryPrivateProjection> {
    const requestId = crypto.randomUUID()
    return await request('pictionary.projection', requestId, { requestId }) as PictionaryPrivateProjection
  }

  function sendPreview(preview: Record<string, unknown>): boolean {
    if (!room || state.value !== 'connected')
      return false
    room.send('pictionary.preview', preview)
    return true
  }

  async function request(type: string, requestId: string, payload: unknown): Promise<unknown> {
    if (!room || state.value !== 'connected')
      throw new Error('pictionary_transport_disconnected')
    if (pending.has(requestId))
      throw new Error('pictionary_request_reused')
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('pictionary_transport_timeout'))
      }, 10_000)
      pending.set(requestId, { reject, resolve, timer })
    })
    room.send(type, payload)
    return await response
  }

  function settle(requestId: string | undefined, message: unknown, field: string): void {
    if (!requestId)
      return
    const waiter = pending.get(requestId)
    if (!waiter)
      return
    pending.delete(requestId)
    clearTimeout(waiter.timer)
    if (!isRecord(message) || message.ok !== true) {
      waiter.reject(new Error(isRecord(message) && typeof message.code === 'string'
        ? message.code
        : 'pictionary_transport_error'))
      return
    }
    const value = message[field]
    if (field === 'result' && isRecord(value) && 'state' in value)
      applyState(value.state)
    if (field === 'projection')
      applyProjection(value)
    waiter.resolve(value)
  }

  async function disconnect(): Promise<void> {
    const current = room
    room = undefined
    connectedSessionId = ''
    connectionId.value = undefined
    rejectPending(new Error('pictionary_transport_disposed'))
    if (current)
      await current.leave().catch(() => undefined)
    state.value = 'idle'
  }

  function rejectPending(error: Error): void {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    pending.clear()
  }

  function applyState(value: unknown): void {
    if (isRecord(value) && typeof value.sessionId === 'string')
      options.onState(value as unknown as PictionaryPublicState)
  }

  function applyProjection(value: unknown): void {
    if (isRecord(value) && typeof value.sessionId === 'string')
      options.onProjection(value as unknown as PictionaryPrivateProjection)
  }

  return {
    connect,
    connectionId: readonly(connectionId),
    disconnect,
    getPrivateProjection,
    isConnected,
    resume,
    sendPreview,
    state: readonly(state),
    submit,
  }
}

function stringField(value: unknown, field: string): string | undefined {
  return isRecord(value) ? stringValue(value[field]) : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
