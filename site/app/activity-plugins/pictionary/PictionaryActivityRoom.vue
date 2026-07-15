<script setup lang="ts">
import type { ActiveActivity, ActivityCanvasOperation } from '@saier/collaboration'
import type { SaierStrokeCommit } from '@saier/core'
import type { Painter } from 'saier'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPainter, PainterEraser } from 'saier'
import { useActivityRealtimeShadow } from '~/composables/useActivityRealtimeShadow'
import { useYunlefunAuth } from '~/composables/useYunlefunAuth'
import { useYunlefunRoomActivities } from '~/composables/useYunlefunRoomActivities'
import { createSiteActivityHref } from '~/utils/activityPluginRoutes'

const props = defineProps<{
  inviteToken?: string
  roomId: string
}>()

const emit = defineEmits<{
  exit: []
  openLobby: []
}>()

const activities = useYunlefunRoomActivities()
const auth = useYunlefunAuth()
const roomId = computed(() => props.roomId)
const inviteToken = computed(() => props.inviteToken)
const state = computed(() => activities.publicState.value)
const currentUserId = computed(() => auth.account.value?.uid ?? '')
const currentPlayer = computed(() => state.value?.players[currentUserId.value])
const isHost = computed(() => state.value?.gameHostUserId === currentUserId.value)
const isDrawer = computed(() => state.value?.round?.drawerId === currentUserId.value)
const canDraw = computed(() => state.value?.phase === 'drawing' && isDrawer.value)
const currentPrivateProjection = computed(() => {
  const currentState = state.value
  const projection = activities.privateProjection.value
  if (!currentState
    || !projection
    || projection.sessionId !== currentState.sessionId
    || projection.privateProjectionRevision !== currentState.privateProjectionRevision
    || projection.phase !== currentState.phase
    || projection.roundId !== currentState.round?.roundId) {
    return undefined
  }
  return projection
})
const players = computed(() => Object.values(state.value?.players ?? {}).sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt))
const canvasRef = ref<HTMLCanvasElement>()
const previewCanvasRef = ref<HTMLCanvasElement>()
const guess = ref('')
const liveGuess = ref('')
const fatalError = ref('')
const now = ref(Date.now())
const appliedCanvasSeq = ref(0)
const appliedStrokeIds = new Set<string>()
const previewLastPoints = new Map<string, { x: number, y: number }>()
const controllerConnectionId = crypto.randomUUID()
const selectedTool = ref<'pen' | 'marker' | 'eraser'>('pen')
const selectedColor = ref('#202020')
const selectedBrushSize = ref(8)
const cycles = ref<1 | 2 | 3 | 4 | 5>(2)
const duration = ref<60_000 | 90_000 | 120_000>(90_000)
let painter: Painter | undefined
let removeStrokeListener: (() => void) | undefined
let removeStrokePreviewListener: (() => void) | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined
let clockTimer: ReturnType<typeof setInterval> | undefined
let syncInFlight = false
let privateProjectionSync: Promise<void> | undefined
let disposed = false

const realtime = useActivityRealtimeShadow({
  createToken: async () => {
    const activity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity
    return activities.createRealtimeToken(roomId.value, activity?.sessionId)
  },
  getCursor: () => ({
    lastCanvasSeq: state.value?.round?.canvasSeq,
    lastEventSeq: state.value?.eventSeq ?? 0,
    privateProjectionRevision: state.value?.privateProjectionRevision,
    roomMetadataRevision: activities.roomSession.value?.room.roomMetadataRevision ?? 0,
    roundId: state.value?.round?.roundId,
  }),
  onCommitted: () => syncAuthority(),
  onPreview: renderRemotePreview,
  realtimeUrl: activities.realtimeUrl,
  resyncTo: async () => void await syncAuthority(),
  roomId: roomId.value,
})

const remainingMs = computed(() => Math.max(0, (state.value?.round?.deadlineAt ?? now.value) - now.value))
const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1000))
const revealReady = computed(() => state.value?.phase !== 'reveal'
  || appliedCanvasSeq.value >= (state.value.round?.finalCanvasSeq ?? 0))
const phaseLabel = computed(() => ({
  choosing: '画手选词',
  drawing: '绘画中',
  finished: '本局结束',
  lobby: '等待开局',
  reveal: revealReady.value ? '揭晓答案' : '同步最后笔迹',
}[state.value?.phase ?? 'lobby'] as string))
const answer = computed(() => revealReady.value ? currentPrivateProjection.value?.answer : undefined)
const transportLabel = computed(() => activities.features.realtimeCommittedEvents
  ? `实时链路 · ${realtime.state.value}`
  : '权威轮询')

onMounted(async () => {
  try {
    const room = await activities.joinRoom(roomId.value, inviteToken.value)
    if (abortDisposedWork())
      return
    const activity = room.room.activeActivity
    if (!activity)
      throw new Error('房间尚未创建游戏')
    await activities.submitCommand({
      activityEpoch: activity.activityEpoch,
      commandId: crypto.randomUUID(),
      payload: {},
      sessionId: activity.sessionId,
      type: 'joinGame',
    })
    if (abortDisposedWork())
      return
    await syncAuthority()
    if (abortDisposedWork())
      return
    if (activities.features.realtimeCommittedEvents && activities.realtimeUrl)
      await realtime.start(activity)
    if (abortDisposedWork())
      return
    pollTimer = setInterval(syncAuthority, 1500)
    clockTimer = setInterval(() => now.value = Date.now(), 250)
  }
  catch (error) {
    if (disposed)
      activities.dispose()
    else
      fatalError.value = error instanceof Error ? error.message : '无法加入房间'
  }
})

onBeforeUnmount(() => {
  disposed = true
  if (pollTimer)
    clearInterval(pollTimer)
  if (clockTimer)
    clearInterval(clockTimer)
  destroyActivityPainter()
  realtime.stop()
  activities.dispose()
})

watch(
  () => state.value?.round?.roundId,
  (roundId, previousRoundId) => {
    if (!roundId || roundId === previousRoundId)
      return
    appliedStrokeIds.clear()
    appliedCanvasSeq.value = 0
    clearRemotePreviews()
  },
)

watch(
  () => [
    state.value?.sessionId,
    state.value?.privateProjectionRevision,
    state.value?.phase,
    state.value?.round?.roundId,
    currentUserId.value,
  ],
  () => requestPrivateProjectionSync(),
  { flush: 'post' },
)

watch([selectedTool, selectedColor, selectedBrushSize], applyPainterTool)

async function syncAuthority(): Promise<void> {
  if (disposed || syncInFlight)
    return
  const activity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity
  if (!activity)
    return
  syncInFlight = true
  try {
    let result = await activities.resumeActivity(activity, {
      lastCanvasSeq: appliedCanvasSeq.value,
      lastEventSeq: state.value?.eventSeq ?? 0,
      roomMetadataRevision: activities.roomSession.value?.room.roomMetadataRevision ?? 0,
      roundId: state.value?.round?.roundId,
    })
    if (abortDisposedWork())
      return
    if (result.kind === 'SESSION_ENDED') {
      fatalError.value = '本局已经结束'
      return
    }
    if (result.kind === 'RESYNC_REQUIRED') {
      result = await activities.resumeActivity(activity, {
        lastCanvasSeq: 0,
        lastEventSeq: 0,
        roomMetadataRevision: 0,
      })
      if (abortDisposedWork())
        return
    }
    if (result.kind === 'SESSION_ENDED' || result.kind === 'RESYNC_REQUIRED')
      return
    const operations = result.kind === 'SNAPSHOT_REQUIRED'
      ? ((result.snapshot.canvas as { operations?: Array<ActivityCanvasOperation<SaierStrokeCommit>> }).operations ?? [])
      : result.canvasOperations as Array<ActivityCanvasOperation<SaierStrokeCommit>>
    const currentRoundId = activities.publicState.value?.round?.roundId
    if (currentRoundId && (!painter || painter.options.strokeEventScope?.roundId !== currentRoundId))
      await createActivityPainter(currentRoundId)
    const canvasSeqBeforeApply = appliedCanvasSeq.value
    await applyCanvasOperations(operations)
    if (appliedCanvasSeq.value > canvasSeqBeforeApply)
      clearRemotePreviews()
    await syncPrivateProjection(activity)
    if (abortDisposedWork())
      return
    const config = activities.publicState.value?.config
    if (config) {
      cycles.value = config.cycles
      duration.value = config.drawingDurationMs
    }
  }
  catch (error) {
    if (disposed)
      activities.dispose()
    else
      fatalError.value = error instanceof Error ? error.message : '同步失败'
  }
  finally {
    syncInFlight = false
  }
}

async function syncPrivateProjection(
  requestedActivity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity,
): Promise<void> {
  if (disposed || !requestedActivity || privateProjectionCoversPublicState(requestedActivity))
    return
  if (privateProjectionSync) {
    await privateProjectionSync
    return
  }

  privateProjectionSync = activities.getPrivateProjection(requestedActivity).then(() => undefined)
  try {
    await privateProjectionSync
  }
  finally {
    privateProjectionSync = undefined
  }
}

function requestPrivateProjectionSync(): void {
  void syncPrivateProjection().catch((error) => {
    if (!disposed)
      fatalError.value = error instanceof Error ? error.message : '同步题目失败'
  })
}

function privateProjectionCoversPublicState(activity: Pick<ActiveActivity, 'sessionId'>): boolean {
  const currentState = state.value
  const projection = activities.privateProjection.value
  if (!currentState || !projection || projection.sessionId !== activity.sessionId)
    return false
  if (projection.privateProjectionRevision > currentState.privateProjectionRevision)
    return true
  return projection.privateProjectionRevision === currentState.privateProjectionRevision
    && projection.phase === currentState.phase
    && projection.roundId === currentState.round?.roundId
}

function abortDisposedWork(): boolean {
  if (!disposed)
    return false
  activities.dispose()
  return true
}

async function createActivityPainter(roundId: string): Promise<void> {
  const activity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity
  if (!activity || !canvasRef.value)
    return
  const strokeEventScope = {
    activityEpoch: activity.activityEpoch,
    documentScope: 'activity' as const,
    roundId,
    sessionId: activity.sessionId,
  }
  if (painter) {
    painter.options.strokeEventScope = strokeEventScope
    painter.clearCanvas()
    applyPainterTool()
    return
  }
  destroyActivityPainter()
  await nextTick()
  const activityPainter = createPainter({
    backend: 'tiled',
    boardSize: { width: 1024, height: 768 },
    pixiOptions: { backgroundAlpha: 0 },
    size: { width: 1024, height: 768 },
    strokeEventScope,
    view: canvasRef.value,
  })
  painter = activityPainter
  await activityPainter.init()
  if (disposed || painter !== activityPainter) {
    activityPainter.destroy()
    if (painter === activityPainter)
      painter = undefined
    return
  }
  applyPainterTool()
  removeStrokeListener = painter.onStrokeCommitted((event) => {
    if (!canDraw.value || event.roundId !== state.value?.round?.roundId)
      return
    void submitCommittedStroke(event.commit)
  })
  removeStrokePreviewListener = painter.onStrokePreview((event) => {
    if (!canDraw.value || !activities.features.realtimePreview)
      return
    const current = state.value
    if (!current?.round || event.roundId !== current.round.roundId)
      return
    realtime.sendPreview({
      activityEpoch: current.activityEpoch,
      brushVersion: 'saier.activity-brush.v1',
      controllerEpoch: current.controllerEpoch ?? 1,
      phaseEpoch: current.phaseEpoch,
      points: [{ x: event.point.x, y: event.point.y, pressure: event.point.pressure }],
      previewSeq: event.previewSeq,
      roundId: current.round.roundId,
      sessionId: current.sessionId,
      strokeId: event.strokeId,
      tool: selectedTool.value,
      baseSize: selectedBrushSize.value,
      color: selectedColor.value,
    })
  })
}

function destroyActivityPainter(): void {
  removeStrokeListener?.()
  removeStrokeListener = undefined
  removeStrokePreviewListener?.()
  removeStrokePreviewListener = undefined
  painter?.destroy()
  painter = undefined
}

function applyPainterTool(): void {
  if (!painter)
    return
  if (selectedTool.value === 'eraser') {
    painter.useTool('eraser')
    PainterEraser.size = selectedBrushSize.value
    return
  }
  painter.useTool('brush')
  painter.brush.setPreset(selectedTool.value === 'marker' ? 'marker' : 'pen')
  painter.brush.setSize(selectedBrushSize.value)
  painter.brush.setColor(Number.parseInt(selectedColor.value.slice(1), 16))
}

function selectTool(tool: 'pen' | 'marker' | 'eraser'): void {
  selectedTool.value = tool
  selectedBrushSize.value = tool === 'marker' ? 22 : tool === 'eraser' ? 20 : 8
}

async function applyCanvasOperations(operations: Array<ActivityCanvasOperation<SaierStrokeCommit>>): Promise<void> {
  if (!painter)
    return
  for (const operation of [...operations].sort((a, b) => a.canvasSeq - b.canvasSeq)) {
    if (appliedStrokeIds.has(operation.strokeId)) {
      appliedCanvasSeq.value = Math.max(appliedCanvasSeq.value, operation.canvasSeq)
      continue
    }
    try {
      painter.strokeRecording.replayStroke(operation.payload, { recordHistory: false })
      painter.flushSurfaceUploads()
      appliedStrokeIds.add(operation.strokeId)
      appliedCanvasSeq.value = Math.max(appliedCanvasSeq.value, operation.canvasSeq)
    }
    catch {
      fatalError.value = '画布回放出现差异，正在等待下一份快照'
      break
    }
  }
}

async function submitCommittedStroke(commit: Readonly<SaierStrokeCommit>): Promise<void> {
  const current = requireRoundState()
  const connectionId = realtime.connectionId.value ?? controllerConnectionId
  const strokeId = `${current.state.controllerEpoch ?? 1}:${connectionId}:${commit.id}`
  const authoritativeCommit = { ...commit, id: strokeId }
  appliedStrokeIds.add(strokeId)
  try {
    const result = await activities.submitCommand({
      activityEpoch: current.activityEpoch,
      commandId: crypto.randomUUID(),
      controllerEpoch: current.state.controllerEpoch ?? 1,
      payload: {
        brushVersion: 'saier.activity-brush.v1',
        commit: authoritativeCommit,
        connectionId,
        strokeId,
        tool: selectedTool.value,
      },
      phaseEpoch: current.state.phaseEpoch,
      roundId: current.state.round!.roundId,
      sessionId: current.sessionId,
      type: 'commitStroke',
    })
    appliedCanvasSeq.value = Math.max(appliedCanvasSeq.value, result.canvasSeq ?? 0)
  }
  catch (error) {
    appliedStrokeIds.delete(strokeId)
    liveGuess.value = error instanceof Error ? error.message : '笔迹提交失败'
    appliedStrokeIds.clear()
    appliedCanvasSeq.value = 0
    await createActivityPainter(current.state.round!.roundId)
    await syncAuthority()
  }
}

function renderRemotePreview(message: Record<string, unknown>): void {
  if (message.userId === currentUserId.value)
    return
  const strokeId = typeof message.strokeId === 'string' ? message.strokeId : ''
  const points = Array.isArray(message.points) ? message.points : []
  const context = previewCanvasRef.value?.getContext('2d')
  if (!context || !strokeId)
    return
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Number.isFinite(message.baseSize)
    ? Math.max(1, Math.min(128, Number(message.baseSize)))
    : message.tool === 'marker' ? 22 : message.tool === 'eraser' ? 20 : 8
  context.strokeStyle = message.tool === 'eraser'
    ? '#a9a29a'
    : typeof message.color === 'string' && /^#[\da-f]{6}$/iu.test(message.color) ? message.color : '#202020'
  for (const rawPoint of points) {
    const point = rawPoint as { x?: unknown, y?: unknown }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
      continue
    const next = { x: Number(point.x), y: Number(point.y) }
    const previous = previewLastPoints.get(strokeId) ?? next
    context.beginPath()
    context.moveTo(previous.x, previous.y)
    context.lineTo(next.x, next.y)
    context.stroke()
    previewLastPoints.set(strokeId, next)
  }
}

function clearRemotePreviews(): void {
  const canvas = previewCanvasRef.value
  if (!canvas)
    return
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  previewLastPoints.clear()
}

async function updateLobby(): Promise<void> {
  const current = requireActivityState()
  await activities.submitCommand({
    activityEpoch: current.activityEpoch,
    commandId: crypto.randomUUID(),
    expectedGameRevision: current.state.gameRevision,
    payload: { cycles: cycles.value, drawingDurationMs: duration.value },
    sessionId: current.sessionId,
    type: 'updateLobby',
  })
  await syncAuthority()
}

async function startGame(): Promise<void> {
  const current = requireActivityState()
  await activities.submitCommand({
    activityEpoch: current.activityEpoch,
    commandId: crypto.randomUUID(),
    expectedGameRevision: current.state.gameRevision,
    payload: {},
    sessionId: current.sessionId,
    type: 'startGame',
  })
  await syncAuthority()
}

async function chooseWord(candidateIndex: number): Promise<void> {
  const current = requireRoundState()
  await activities.submitCommand({
    activityEpoch: current.activityEpoch,
    commandId: crypto.randomUUID(),
    expectedGameRevision: current.state.gameRevision,
    payload: { candidateIndex },
    phaseEpoch: current.state.phaseEpoch,
    roundId: current.state.round!.roundId,
    sessionId: current.sessionId,
    type: 'chooseWord',
  })
  await syncAuthority()
}

async function submitGuess(): Promise<void> {
  const text = guess.value.trim()
  if (!text)
    return
  const current = requireRoundState()
  guess.value = ''
  try {
    const result = await activities.submitCommand({
      activityEpoch: current.activityEpoch,
      commandId: crypto.randomUUID(),
      payload: { displayText: text },
      phaseEpoch: current.state.phaseEpoch,
      roundId: current.state.round!.roundId,
      sessionId: current.sessionId,
      type: 'submitGuess',
    })
    liveGuess.value = result.transient?.correct ? '猜对了！' : `${currentUserId.value}: ${text}`
    await syncAuthority()
  }
  catch (error) {
    liveGuess.value = error instanceof Error ? error.message : '猜词失败'
  }
}

async function takeController(): Promise<void> {
  const current = requireRoundState()
  await activities.submitCommand({
    activityEpoch: current.activityEpoch,
    commandId: crypto.randomUUID(),
    payload: { connectionId: realtime.connectionId.value ?? controllerConnectionId },
    phaseEpoch: current.state.phaseEpoch,
    roundId: current.state.round!.roundId,
    sessionId: current.sessionId,
    type: 'takeController',
  })
  await syncAuthority()
}

async function setPlayerMuted(userId: string, muted: boolean): Promise<void> {
  const current = requireActivityState()
  await activities.submitCommand({
    activityEpoch: current.activityEpoch,
    commandId: crypto.randomUUID(),
    expectedGameRevision: current.state.gameRevision,
    payload: { muted, userId },
    sessionId: current.sessionId,
    type: 'setPlayerMuted',
  })
  await syncAuthority()
}

async function copyInvite(): Promise<void> {
  await navigator.clipboard.writeText(createSiteActivityHref({
    inviteToken: inviteToken.value,
    roomId: roomId.value,
    type: 'pictionary',
  }, window.location.origin))
  liveGuess.value = '邀请链接已复制'
}

function requireActivityState() {
  const activity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity
  const value = state.value
  if (!activity || !value)
    throw new Error('游戏状态尚未同步')
  return { activityEpoch: activity.activityEpoch, sessionId: activity.sessionId, state: value }
}

function requireRoundState() {
  const current = requireActivityState()
  if (!current.state.round)
    throw new Error('当前没有进行中的回合')
  return current
}
</script>

<template>
  <main class="pictionary-room">
    <header class="pictionary-room__topbar">
      <button type="button" class="pictionary-room__brand is-button" @click="emit('exit')">SAIER / PICTIONARY</button>
      <div class="pictionary-room__status">
        <span class="pictionary-room__live-dot" />
        {{ transportLabel }}
      </div>
      <div class="pictionary-room__actions">
        <button type="button" class="room-action" @click="copyInvite">
          <span class="i-ph-share-network" />
          邀请
        </button>
        <button type="button" class="room-action" @click="emit('exit')">
          <span class="i-ph-x" />
          退出插件
        </button>
      </div>
    </header>

    <section v-if="fatalError && !state" class="room-fatal" role="alert">
      <span class="i-ph-warning-circle" />
      <h1>无法进入游戏</h1>
      <p>{{ fatalError }}</p>
      <button type="button" class="room-link" @click="emit('openLobby')">返回游戏大厅</button>
    </section>

    <template v-else>
      <section v-if="state?.phase === 'lobby'" class="room-lobby">
        <div class="room-lobby__intro">
          <span class="room-kicker">LOBBY</span>
          <h1>人齐了，就开画。</h1>
          <p>{{ players.length }} 位玩家已加入。中途加入者会从下一局开始进入画手顺序。</p>
          <button class="room-primary" type="button" @click="copyInvite">
            <span class="i-ph-link" />复制邀请链接
          </button>
        </div>

        <div class="room-lobby__panel">
          <h2>玩家</h2>
          <ul class="player-list">
            <li v-for="player in players" :key="player.userId">
              <span class="player-avatar">{{ player.userId.slice(0, 2).toUpperCase() }}</span>
              <span><strong>{{ player.userId }}</strong><small>{{ player.status }}</small></span>
              <span v-if="player.userId === state.gameHostUserId" class="host-badge">HOST</span>
              <span :class="['online-dot', { 'is-offline': !player.online }]" />
            </li>
          </ul>

          <div v-if="isHost" class="lobby-settings">
            <label>轮数
              <select v-model.number="cycles" :disabled="activities.busy.value" @change="updateLobby">
                <option v-for="value in [1, 2, 3, 4, 5]" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label>每轮
              <select v-model.number="duration" :disabled="activities.busy.value" @change="updateLobby">
                <option :value="60000">60 秒</option>
                <option :value="90000">90 秒</option>
                <option :value="120000">120 秒</option>
              </select>
            </label>
            <button class="room-primary" type="button" :disabled="activities.busy.value || players.filter(player => player.status === 'active').length < 2" @click="startGame">
              开始游戏
            </button>
          </div>
          <p v-else class="waiting-host">等待 {{ state.gameHostUserId }} 开始游戏…</p>
        </div>
      </section>

      <section v-else class="room-game">
        <div class="room-game__main">
          <div class="round-strip">
            <div>
              <span class="room-kicker">{{ phaseLabel }}</span>
              <strong v-if="state?.round">画手：{{ state.round.drawerId }}</strong>
            </div>
            <time>{{ remainingSeconds.toString().padStart(2, '0') }}</time>
          </div>

          <p v-if="canDraw" class="drawer-answer" aria-live="polite">
            <span>你的题目</span>
            <strong>{{ currentPrivateProjection?.answer || '正在同步题目…' }}</strong>
          </p>

          <div class="activity-canvas" :class="{ 'is-readonly': !canDraw }">
            <canvas ref="canvasRef" />
            <canvas ref="previewCanvasRef" class="activity-canvas__preview" width="1024" height="768" aria-hidden="true" />
            <div v-if="state?.phase === 'choosing'" class="canvas-overlay">
              <template v-if="isDrawer">
                <span class="room-kicker">三选一</span>
                <h2>选一个题目开始画</h2>
                <div class="candidate-list">
                  <button
                    v-for="(candidate, index) in currentPrivateProjection?.candidates ?? []"
                    :key="candidate"
                    type="button"
                    @click="chooseWord(index)"
                  >{{ candidate }}</button>
                </div>
              </template>
              <template v-else>
                <span class="i-ph-hourglass-medium canvas-overlay__icon" />
                <h2>画手正在选题</h2>
              </template>
            </div>
            <div v-if="state?.phase === 'reveal'" class="canvas-overlay is-reveal">
              <span class="room-kicker">{{ revealReady ? '答案' : '画布同步中' }}</span>
              <h2>{{ answer || '正在补齐最后的笔迹…' }}</h2>
            </div>
            <div v-if="state?.phase === 'finished'" class="canvas-overlay is-reveal">
              <span class="room-kicker">FINAL SCORE</span>
              <h2>{{ players[0]?.userId }} 获胜</h2>
              <button class="room-primary" type="button" @click="emit('openLobby')">再开一局</button>
            </div>
          </div>

          <div v-if="canDraw" class="drawing-tools">
            <button v-for="tool in ['pen', 'marker', 'eraser'] as const" :key="tool" :class="{ 'is-active': selectedTool === tool }" type="button" @click="selectTool(tool)">
              {{ { pen: '画笔', marker: '马克笔', eraser: '橡皮' }[tool] }}
            </button>
            <input v-if="selectedTool !== 'eraser'" v-model="selectedColor" type="color" aria-label="笔刷颜色">
            <label class="drawing-size">
              <span>粗细 {{ selectedBrushSize }}</span>
              <input v-model.number="selectedBrushSize" type="range" min="1" max="128" step="1" aria-label="画笔粗细">
            </label>
            <button v-if="isDrawer" type="button" @click="takeController">接管绘制</button>
          </div>

          <form v-if="state?.phase === 'drawing' && !isDrawer && currentPlayer?.status === 'active'" class="guess-bar" @submit.prevent="submitGuess">
            <input v-model="guess" maxlength="64" autocomplete="off" placeholder="输入你的答案…">
            <button type="submit">猜</button>
          </form>
          <p v-if="liveGuess" class="live-guess" aria-live="polite">{{ liveGuess }}</p>
        </div>

        <aside class="scoreboard">
          <span class="room-kicker">SCOREBOARD</span>
          <ol>
            <li v-for="(player, index) in players" :key="player.userId">
              <span class="score-rank">{{ index + 1 }}</span>
              <span class="score-name">{{ player.userId }}<small v-if="player.userId === currentUserId">你</small></span>
              <strong>{{ player.score }}</strong>
              <button
                v-if="isHost && player.userId !== currentUserId"
                type="button"
                class="score-mute"
                @click="setPlayerMuted(player.userId, !player.muted)"
              >{{ player.muted ? '解除静音' : '静音' }}</button>
            </li>
          </ol>
          <p v-if="fatalError" class="room-warning">{{ fatalError }}</p>
        </aside>
      </section>
    </template>
  </main>
</template>

<style scoped>
.pictionary-room {
  min-height: 100dvh;
  color: #211f1e;
  background: #eee8df;
}

.pictionary-room__topbar {
  position: sticky;
  z-index: 50;
  top: 0;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  min-height: 58px;
  padding: 0 20px;
  border-bottom: 1px solid #d0c8be;
  background: #fffdf9;
}

.pictionary-room__brand {
  padding: 0;
  border: 0;
  color: #25211f;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .12em;
  text-decoration: none;
  background: transparent;
  cursor: pointer;
}

.pictionary-room__status {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #635d58;
  font-size: 12px;
}

.pictionary-room__live-dot,
.online-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2e9b55;
}

.online-dot.is-offline {
  background: #aaa39c;
}

.pictionary-room__actions {
  display: flex;
  justify-self: end;
  gap: 8px;
}

.room-action {
  justify-self: end;
}

.room-action,
.room-primary,
.drawing-tools button {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid #c9c0b7;
  border-radius: 9px;
  background: #fff;
  color: inherit;
  font-weight: 750;
  cursor: pointer;
}

.room-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.room-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-color: #e8402e;
  background: #e8402e;
  color: #fff;
  text-decoration: none;
}

.room-primary:disabled {
  cursor: not-allowed;
  opacity: .45;
}

.room-lobby {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 440px);
  gap: clamp(28px, 6vw, 80px);
  width: min(1100px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(52px, 9vw, 120px) 0;
}

.room-kicker {
  display: block;
  color: #e8402e;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .16em;
}

.room-lobby__intro h1 {
  max-width: 620px;
  margin: 14px 0 20px;
  font-size: clamp(48px, 8vw, 88px);
  line-height: .94;
  letter-spacing: -.06em;
}

.room-lobby__intro p {
  max-width: 520px;
  margin: 0 0 30px;
  color: #6b645e;
  font-size: 16px;
  line-height: 1.7;
}

.room-lobby__panel,
.scoreboard {
  padding: 28px;
  border: 1px solid #cbc2b8;
  border-radius: 16px;
  background: #fffdf9;
  box-shadow: 0 18px 42px rgb(62 47 36 / 10%);
}

.room-lobby__panel h2 {
  margin: 0 0 20px;
}

.player-list,
.scoreboard ol {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  list-style: none;
}

.player-list li {
  display: grid;
  grid-template-columns: 38px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #eee7df;
}

.player-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  background: #eee8df;
  font-size: 11px;
  font-weight: 900;
}

.player-list strong,
.player-list small {
  display: block;
}

.player-list small {
  margin-top: 2px;
  color: #8b837c;
  font-size: 11px;
}

.host-badge {
  color: #e8402e;
  font-size: 10px;
  font-weight: 900;
}

.lobby-settings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e5ddd4;
}

.lobby-settings label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: #6c655f;
  font-size: 12px;
}

.lobby-settings select {
  min-height: 42px;
  padding: 0 10px;
  border: 1px solid #cbc2b8;
  border-radius: 8px;
  background: #fff;
}

.lobby-settings .room-primary {
  grid-column: 1 / -1;
  margin-top: 8px;
}

.waiting-host {
  margin: 20px 0 0;
  color: #77706a;
  font-size: 13px;
}

.room-game {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 18px;
  width: min(1320px, calc(100% - 28px));
  margin: 0 auto;
  padding: 18px 0 32px;
}

.round-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 0 6px;
}

.round-strip strong {
  display: block;
  margin-top: 4px;
}

.round-strip time {
  color: #e8402e;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 38px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.drawer-answer {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 6px 10px;
  color: #665f59;
  font-size: 12px;
}

.drawer-answer strong {
  color: #e8402e;
  font-size: 18px;
}

.activity-canvas {
  position: relative;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border: 1px solid #c8bfb6;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 40px rgb(52 40 31 / 12%);
}

.activity-canvas canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.activity-canvas .activity-canvas__preview {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}

.activity-canvas.is-readonly canvas {
  pointer-events: none;
}

.canvas-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(255 253 249 / 94%);
  text-align: center;
}

.canvas-overlay h2 {
  margin: 12px 0 24px;
  font-size: clamp(28px, 5vw, 54px);
}

.canvas-overlay__icon {
  color: #e8402e;
  font-size: 48px;
}

.candidate-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.candidate-list button {
  min-width: 150px;
  min-height: 58px;
  padding: 0 20px;
  border: 2px solid #272220;
  border-radius: 10px;
  background: #fff;
  font-size: 18px;
  font-weight: 900;
  cursor: pointer;
}

.candidate-list button:hover {
  border-color: #e8402e;
  color: #e8402e;
}

.drawing-tools,
.guess-bar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.drawing-tools button.is-active {
  border-color: #e8402e;
  color: #e8402e;
}

.drawing-tools input[type='color'] {
  width: 46px;
  min-height: 42px;
  padding: 4px;
  border: 1px solid #c9c0b7;
  border-radius: 8px;
  background: #fff;
}

.drawing-size {
  display: grid;
  min-width: 150px;
  align-content: center;
  gap: 2px;
  padding-inline: 8px;
  color: #635d58;
  font-size: 11px;
  font-weight: 750;
}

.drawing-size input {
  width: 100%;
}

.guess-bar input {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid #c9c0b7;
  border-radius: 9px;
  background: #fff;
  font-size: 16px;
}

.guess-bar button {
  min-width: 70px;
  border: 0;
  border-radius: 9px;
  background: #e8402e;
  color: #fff;
  font-weight: 900;
}

.live-guess {
  min-height: 22px;
  margin: 8px 4px 0;
  color: #625b55;
  font-size: 13px;
}

.scoreboard {
  align-self: start;
  margin-top: 54px;
}

.scoreboard ol {
  margin-top: 18px;
}

.scoreboard li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  border-bottom: 1px solid #eee7df;
}

.score-mute {
  padding: 3px 6px;
  border: 1px solid #d7cfc7;
  border-radius: 6px;
  background: transparent;
  color: #756e68;
  font-size: 10px;
  cursor: pointer;
}

.score-rank {
  color: #9b938b;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.score-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-name small {
  margin-left: 7px;
  color: #e8402e;
}

.scoreboard strong {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.room-warning {
  color: #b42318;
  font-size: 12px;
}

.room-fatal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: calc(100dvh - 58px);
  padding: 24px;
  text-align: center;
}

.room-fatal > span {
  color: #e8402e;
  font-size: 52px;
}

.room-link {
  padding: 0;
  border: 0;
  color: #e8402e;
  font: inherit;
  text-decoration: underline;
  background: transparent;
  cursor: pointer;
}

@media (max-width: 860px) {
  .pictionary-room__topbar {
    grid-template-columns: 1fr auto;
    padding: 0 12px;
  }

  .pictionary-room__status {
    display: none;
  }

  .pictionary-room__actions .room-action:last-child {
    display: none;
  }

  .room-lobby,
  .room-game {
    grid-template-columns: 1fr;
  }

  .room-lobby {
    width: min(100% - 24px, 620px);
    padding: 40px 0;
  }

  .room-lobby__intro h1 {
    font-size: clamp(46px, 15vw, 70px);
  }

  .room-game {
    width: calc(100% - 16px);
    padding-top: 8px;
  }

  .scoreboard {
    order: 2;
    margin-top: 0;
  }

  .round-strip {
    position: sticky;
    z-index: 20;
    top: 58px;
    background: #eee8df;
  }

  .activity-canvas {
    border-radius: 8px;
  }

  .drawing-tools {
    overflow-x: auto;
  }

  .drawing-tools button {
    flex: 0 0 auto;
    min-height: 44px;
  }

  .guess-bar {
    position: sticky;
    z-index: 20;
    bottom: 8px;
  }

  .guess-bar input,
  .guess-bar button {
    min-height: 52px;
  }
}
</style>
