import type {
  ActiveActivity,
  ActivityCommand,
  PictionaryCommandType,
  PictionaryPublicState,
  ResumeCursor,
  ResumeResponse,
} from '@saier/collaboration'
import type { YunlefunCloudbaseApp } from './useYunlefunAuth'
import type { YunlefunCloudRoomSession } from './useYunlefunCloudRooms'
import { readonly } from 'vue'
import { useRuntimeConfig, useState } from '#imports'
import { normalizeYunlefunCloudErrorMessage } from '../utils/yunlefunCloudErrors'
import { useYunlefunAuth } from './useYunlefunAuth'

const DEFAULT_ROOM_API_FUNCTION_NAME = 'saier-room-api'

export interface PictionaryActivityCommand<T = Record<string, unknown>> extends ActivityCommand<T> {
  type: PictionaryCommandType
}

export interface ActivityPrivateProjection {
  answer?: string
  candidates?: string[]
  phase: PictionaryPublicState['phase']
  privateProjectionRevision: number
  roundId?: string
  sessionId: string
}

export interface ActivityCommandResult {
  activityEpoch: number
  canvasSeq?: number
  deduped?: boolean
  eventSeq: number
  gameRevision: number
  ok: true
  privateProjectionRevision?: number
  roundId?: string
  transient?: {
    accepted: boolean
    correct: boolean
    reason?: string
    text?: string
    userId?: string
  }
}

export interface ActivityRoomCreationResult {
  inviteToken?: string
  session: YunlefunCloudRoomSession
}

interface ActivityActivationResult {
  activityEpoch: number
  eventSeq: number
  gameRevision: number
  roomMetadataRevision: number
  sessionId: string
}

interface RealtimeTokenResult {
  expiresAt: number
  token: string
}

interface RoomActivityRuntimeConfig {
  public: {
    saierCloudRoomApiFunctionName?: string
    saierFeatures?: {
      pictionary?: boolean
      realtimeCommittedEvents?: boolean
      realtimePreview?: boolean
      redisDeadlineAcceleration?: boolean
    }
    saierRealtimeUrl?: string
  }
}

export function useYunlefunRoomActivities() {
  const config = useRuntimeConfig() as unknown as RoomActivityRuntimeConfig
  const auth = useYunlefunAuth()
  const roomSession = useState<YunlefunCloudRoomSession | null>('yunlefun:room-activity:room-session', () => null)
  const activeActivity = useState<ActiveActivity | null>('yunlefun:room-activity:active', () => null)
  const publicState = useState<PictionaryPublicState | null>('yunlefun:room-activity:public-state', () => null)
  const privateProjection = useState<ActivityPrivateProjection | null>('yunlefun:room-activity:private-projection', () => null)
  const lastError = useState<string>('yunlefun:room-activity:error', () => '')
  const busy = useState<boolean>('yunlefun:room-activity:busy', () => false)
  const roomApiFunctionName = config.public.saierCloudRoomApiFunctionName ?? DEFAULT_ROOM_API_FUNCTION_NAME

  async function createRoom(title: string): Promise<ActivityRoomCreationResult> {
    return run(async () => {
      const result = await callRoomApi('createActivityRoom', {
        title: title.trim() || 'Pictionary Room',
        visibility: 'link',
      }) as ActivityRoomCreationResult
      roomSession.value = result.session
      return result
    })
  }

  async function joinRoom(roomId: string, inviteToken?: string): Promise<YunlefunCloudRoomSession> {
    return run(async () => {
      const result = await callRoomApi('joinActivityRoom', { inviteToken, roomId }) as { session: YunlefunCloudRoomSession }
      roomSession.value = result.session
      activeActivity.value = result.session.room.activeActivity ?? null
      return result.session
    })
  }

  async function activatePictionary(input: {
    commandId: string
    config?: Record<string, unknown>
    roomId: string
    words?: string[]
  }): Promise<ActivityActivationResult> {
    return run(async () => {
      const result = await callRoomApi('activatePictionary', input) as ActivityActivationResult
      activeActivity.value = {
        activityEpoch: result.activityEpoch,
        protocolVersion: 1,
        sessionId: result.sessionId,
        status: 'lobby',
        type: 'pictionary',
      }
      return result
    })
  }

  async function submitCommand<T>(command: PictionaryActivityCommand<T>): Promise<ActivityCommandResult> {
    return run(() => callRoomApi('submitActivityCommand', { ...command }) as Promise<ActivityCommandResult>)
  }

  async function resumeActivity(
    activity: Pick<ActiveActivity, 'activityEpoch' | 'sessionId'>,
    cursor: ResumeCursor,
  ): Promise<ResumeResponse<Record<string, unknown>, unknown, PictionaryPublicState>> {
    return run(async () => {
      const result = await callRoomApi('resumeActivity', {
        activityEpoch: activity.activityEpoch,
        cursor,
        sessionId: activity.sessionId,
      }) as ResumeResponse<Record<string, unknown>, unknown, PictionaryPublicState>
      if (result.kind === 'SNAPSHOT_REQUIRED')
        publicState.value = result.snapshot.state
      else if (result.kind === 'DELTA')
        publicState.value = result.state
      return result
    })
  }

  async function getPrivateProjection(activity: Pick<ActiveActivity, 'activityEpoch' | 'sessionId'>): Promise<ActivityPrivateProjection> {
    return run(async () => {
      const result = await callRoomApi('getActivityPrivateProjection', {
        activityEpoch: activity.activityEpoch,
        sessionId: activity.sessionId,
      }) as ActivityPrivateProjection
      const current = privateProjection.value
      if (!current
        || current.sessionId !== result.sessionId
        || result.privateProjectionRevision >= current.privateProjectionRevision) {
        privateProjection.value = result
      }
      return result
    })
  }

  async function createRealtimeToken(roomId: string, sessionId?: string): Promise<RealtimeTokenResult> {
    return run(() => callRoomApi('createActivityRealtimeToken', { roomId, sessionId }) as Promise<RealtimeTokenResult>)
  }

  async function callRoomApi(action: string, data: Record<string, unknown>): Promise<unknown> {
    if (!auth.isAuthenticated.value)
      await auth.initialize()
    if (!auth.isAuthenticated.value && !await auth.signIn('interactive'))
      throw new Error('not_authenticated')
    const app = await auth.getCloudbaseApp() as YunlefunCloudbaseApp | undefined
    if (!app?.callFunction)
      throw new Error('backend_unavailable')
    const response = await app.callFunction({
      data: { action, ...data },
      name: roomApiFunctionName,
    })
    if (response.result === undefined)
      throw new Error('backend_unavailable')
    return response.result
  }

  async function run<T>(operation: () => Promise<T>): Promise<T> {
    busy.value = true
    lastError.value = ''
    try {
      return await operation()
    }
    catch (error) {
      lastError.value = normalizeYunlefunCloudErrorMessage(error) ?? 'backend_unavailable'
      throw error
    }
    finally {
      busy.value = false
    }
  }

  function dispose(): void {
    roomSession.value = null
    activeActivity.value = null
    publicState.value = null
    privateProjection.value = null
    lastError.value = ''
    busy.value = false
  }

  return {
    activeActivity: readonly(activeActivity),
    activatePictionary,
    busy: readonly(busy),
    createRealtimeToken,
    createRoom,
    dispose,
    features: Object.freeze({
      pictionary: config.public.saierFeatures?.pictionary ?? false,
      realtimeCommittedEvents: config.public.saierFeatures?.realtimeCommittedEvents ?? false,
      realtimePreview: config.public.saierFeatures?.realtimePreview ?? false,
      redisDeadlineAcceleration: config.public.saierFeatures?.redisDeadlineAcceleration ?? false,
    }),
    getPrivateProjection,
    joinRoom,
    lastError: readonly(lastError),
    privateProjection: readonly(privateProjection),
    publicState: readonly(publicState),
    realtimeUrl: config.public.saierRealtimeUrl ?? '',
    resumeActivity,
    roomSession: readonly(roomSession),
    submitCommand,
  }
}
