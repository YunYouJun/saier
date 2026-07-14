import type { ActiveActivity, ActivityTransportState, ActivityWatermark, ResumeCursor } from '@saier/collaboration'
import { readonly, shallowRef } from 'vue'

export interface ActivityRealtimeShadowOptions {
  createToken: () => Promise<{ expiresAt: number, token: string }>
  getCursor: () => ResumeCursor
  onCommitted: (notification: Record<string, unknown>) => Promise<void> | void
  onPreview?: (preview: Record<string, unknown>) => void
  realtimeUrl: string
  resyncTo: (watermark: ActivityWatermark) => Promise<void>
  roomId: string
}

export function useActivityRealtimeShadow(options: ActivityRealtimeShadowOptions) {
  const state = shallowRef<ActivityTransportState>('connecting')
  const lastWatermark = shallowRef<ActivityWatermark>()
  const connectionId = shallowRef<string>()
  let activity: Pick<ActiveActivity, 'activityEpoch' | 'sessionId'> | undefined
  let socket: WebSocket | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let reconnectAttempts = 0
  let barrierInFlight = false
  const bufferedNotifications: Array<Record<string, unknown>> = []

  async function start(nextActivity: Pick<ActiveActivity, 'activityEpoch' | 'sessionId'>): Promise<void> {
    activity = nextActivity
    stopped = false
    reconnectAttempts = 0
    await connect()
  }

  function stop(): void {
    stopped = true
    if (reconnectTimer)
      clearTimeout(reconnectTimer)
    socket?.close(1000, 'client-stop')
    socket = undefined
  }

  async function connect(): Promise<void> {
    if (stopped || !activity || !options.realtimeUrl)
      return
    state.value = reconnectAttempts === 0 ? 'connecting' : 'reconnecting'
    const credentials = await options.createToken()
    const current = new WebSocket(options.realtimeUrl)
    socket = current
    current.addEventListener('open', () => {
      current.send(JSON.stringify({
        activityEpoch: activity!.activityEpoch,
        sessionId: activity!.sessionId,
        token: credentials.token,
        type: 'auth',
      }))
    })
    current.addEventListener('message', event => void handleMessage(current, event.data))
    current.addEventListener('close', () => scheduleReconnect())
    current.addEventListener('error', () => current.close())
  }

  async function handleMessage(current: WebSocket, data: unknown): Promise<void> {
    if (current !== socket || typeof data !== 'string')
      return
    let message: Record<string, any>
    try {
      message = JSON.parse(data) as Record<string, any>
    }
    catch {
      return
    }
    if (message.type === 'reauthRequired') {
      const credentials = await options.createToken()
      current.send(JSON.stringify({ token: credentials.token, type: 'reauth' }))
      return
    }
    if (message.type === 'authenticated') {
      connectionId.value = typeof message.connectionId === 'string' ? message.connectionId : undefined
      return
    }
    if (message.type === 'watermark') {
      const watermark = parseWatermark(message)
      if (!watermark)
        return
      lastWatermark.value = watermark
      await establishBarrier(watermark)
      return
    }
    if (message.type === 'activityCommitted' || message.type === 'privateProjectionInvalidated') {
      if (barrierInFlight)
        bufferedNotifications.push(message)
      else
        await options.onCommitted(message)
      return
    }
    if (message.type === 'preview')
      options.onPreview?.(message)
  }

  async function establishBarrier(watermark: ActivityWatermark): Promise<void> {
    if (barrierInFlight)
      return
    barrierInFlight = true
    state.value = 'resyncing'
    try {
      await options.resyncTo(watermark)
      for (const notification of bufferedNotifications.splice(0))
        await options.onCommitted(notification)
      state.value = 'recovered'
      state.value = 'realtime'
      reconnectAttempts = 0
    }
    catch {
      state.value = 'degraded-polling'
    }
    finally {
      barrierInFlight = false
    }
  }

  function scheduleReconnect(): void {
    if (stopped)
      return
    socket = undefined
    reconnectAttempts += 1
    if (reconnectAttempts >= 3)
      state.value = 'degraded-polling'
    else
      state.value = 'reconnecting'
    const delay = Math.min(5000, 500 * 2 ** Math.min(reconnectAttempts, 4))
    reconnectTimer = setTimeout(() => void connect(), delay)
  }

  function sendPreview(preview: Record<string, unknown>): boolean {
    if (state.value !== 'realtime' || socket?.readyState !== WebSocket.OPEN)
      return false
    socket.send(JSON.stringify({ ...preview, type: 'preview' }))
    return true
  }

  function parseWatermark(value: Record<string, unknown>): ActivityWatermark | undefined {
    if (!Number.isSafeInteger(value.eventSeq)
      || !Number.isSafeInteger(value.roomMetadataRevision)
      || !Number.isSafeInteger(value.privateProjectionRevision)) {
      return undefined
    }
    return {
      canvasSeq: numberValue(value.canvasSeq),
      eventSeq: value.eventSeq as number,
      privateProjectionRevision: value.privateProjectionRevision as number,
      roomMetadataRevision: value.roomMetadataRevision as number,
      roundId: typeof value.roundId === 'string' ? value.roundId : undefined,
    }
  }

  return {
    getCursor: options.getCursor,
    connectionId: readonly(connectionId),
    lastWatermark: readonly(lastWatermark),
    sendPreview,
    start,
    state: readonly(state),
    stop,
  }
}

function numberValue(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined
}
