<script setup lang="ts">
import type { ActiveActivity, ActivityCanvasOperation } from '@saier/collaboration'
import type { SaierStrokeCommit } from '@saier/core'
import type { Painter } from 'saier'
import type { PictionaryTool } from './i18n'
import { createPainter, PainterEraser } from 'saier'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { SiteActivityButton, SiteActivityPanel } from '~/components/activity'
import { useActivityRealtimeShadow } from '~/composables/useActivityRealtimeShadow'
import { useYunlefunAuth } from '~/composables/useYunlefunAuth'
import { useYunlefunRoomActivities } from '~/composables/useYunlefunRoomActivities'
import { createSiteActivityHref } from '~/utils/activityPluginRoutes'
import PictionaryRoomLobby from './PictionaryRoomLobby.vue'
import PictionaryRoomToolbar from './PictionaryRoomToolbar.vue'
import PictionaryScoreboard from './PictionaryScoreboard.vue'
import { formatPictionaryMessage, usePictionaryI18n } from './i18n'

const props = defineProps<{
  inviteToken?: string
  roomId: string
}>()

const emit = defineEmits<{
  openLobby: []
}>()

const activities = useYunlefunRoomActivities()
const auth = useYunlefunAuth()
const { text } = usePictionaryI18n()
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
const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')
const previewCanvasRef = useTemplateRef<HTMLCanvasElement>('previewCanvas')
const guess = shallowRef('')
const liveGuess = shallowRef('')
const fatalError = shallowRef('')
const now = shallowRef(Date.now())
const appliedCanvasSeq = shallowRef(0)
const appliedStrokeIds = new Set<string>()
const previewLastPoints = new Map<string, { x: number, y: number }>()
const controllerConnectionId = crypto.randomUUID()
const selectedTool = shallowRef<PictionaryTool>('pen')
const selectedColor = shallowRef('#202020')
const selectedBrushSize = shallowRef(8)
const cycles = shallowRef<1 | 2 | 3 | 4 | 5>(2)
const duration = shallowRef<60_000 | 90_000 | 120_000>(90_000)
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
const phaseLabel = computed(() => state.value?.phase === 'reveal' && !revealReady.value
  ? text.value.room.syncFinalStroke
  : text.value.phases[state.value?.phase ?? 'lobby'])
const answer = computed(() => revealReady.value ? currentPrivateProjection.value?.answer : undefined)
const transportLabel = computed(() => activities.features.realtimeCommittedEvents
  ? formatPictionaryMessage(text.value.room.realtimeTransport, { state: realtime.state.value })
  : text.value.room.pollingTransport)
const drawerLabel = computed(() => state.value?.round
  ? formatPictionaryMessage(text.value.room.drawer, { drawer: state.value.round.drawerId })
  : '')
const brushSizeLabel = computed(() => formatPictionaryMessage(text.value.room.brushSize, {
  size: selectedBrushSize.value,
}))
const winnerLabel = computed(() => formatPictionaryMessage(text.value.room.winner, {
  player: players.value[0]?.userId ?? '—',
}))
const revealLabel = computed(() => revealReady.value ? text.value.room.answer : text.value.room.canvasSyncing)
const revealAnswer = computed(() => answer.value || text.value.room.syncFinalStroke)

onMounted(async () => {
  try {
    const room = await activities.joinRoom(roomId.value, inviteToken.value)
    if (abortDisposedWork())
      return
    const activity = room.room.activeActivity
    if (!activity)
      throw new Error(text.value.errors.gameMissing)
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
      fatalError.value = error instanceof Error ? error.message : text.value.errors.joinFailed
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
      fatalError.value = text.value.errors.sessionEnded
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
      fatalError.value = error instanceof Error ? error.message : text.value.errors.syncFailed
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
      fatalError.value = error instanceof Error ? error.message : text.value.errors.promptSyncFailed
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

function selectTool(tool: PictionaryTool): void {
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
      fatalError.value = text.value.errors.replayMismatch
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
    liveGuess.value = error instanceof Error ? error.message : text.value.errors.strokeFailed
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
  const guessText = guess.value.trim()
  if (!guessText)
    return
  const current = requireRoundState()
  guess.value = ''
  try {
    const result = await activities.submitCommand({
      activityEpoch: current.activityEpoch,
      commandId: crypto.randomUUID(),
      payload: { displayText: guessText },
      phaseEpoch: current.state.phaseEpoch,
      roundId: current.state.round!.roundId,
      sessionId: current.sessionId,
      type: 'submitGuess',
    })
    liveGuess.value = result.transient?.correct ? text.value.room.correctGuess : `${currentUserId.value}: ${guessText}`
    await syncAuthority()
  }
  catch (error) {
    liveGuess.value = error instanceof Error ? error.message : text.value.errors.guessFailed
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
  liveGuess.value = text.value.room.copiedInvite
}

function requireActivityState() {
  const activity = activities.activeActivity.value ?? activities.roomSession.value?.room.activeActivity
  const value = state.value
  if (!activity || !value)
    throw new Error(text.value.errors.stateUnavailable)
  return { activityEpoch: activity.activityEpoch, sessionId: activity.sessionId, state: value }
}

function requireRoundState() {
  const current = requireActivityState()
  if (!current.state.round)
    throw new Error(text.value.errors.noRound)
  return current
}

function toolLabel(tool: PictionaryTool): string {
  return text.value.tools[tool]
}
</script>

<template>
  <main class="pictionary-room site-activity-surface">
    <PictionaryRoomToolbar :transport-label="transportLabel" @invite="copyInvite" />

    <section v-if="fatalError && !state" class="pictionary-room__fatal" role="alert">
      <span class="pictionary-room__fatal-icon i-ph-warning-circle" aria-hidden="true" />
      <h1>{{ text.room.unableEnter }}</h1>
      <p class="site-activity-error">
        {{ fatalError }}
      </p>
      <SiteActivityButton @click="emit('openLobby')">
        {{ text.room.returnLobby }}
      </SiteActivityButton>
    </section>

    <template v-else>
      <PictionaryRoomLobby
        v-if="state?.phase === 'lobby'"
        v-model:cycles="cycles"
        v-model:duration="duration"
        :busy="activities.busy.value"
        :host-id="state.gameHostUserId"
        :is-host="isHost"
        :players="players"
        @invite="copyInvite"
        @settings-change="updateLobby"
        @start="startGame"
      />

      <section v-else class="pictionary-room__game site-activity-container">
        <div class="pictionary-room__main">
          <div class="pictionary-round-strip">
            <div>
              <span class="site-activity-kicker">{{ phaseLabel }}</span>
              <strong v-if="drawerLabel">{{ drawerLabel }}</strong>
            </div>
            <time>{{ remainingSeconds.toString().padStart(2, '0') }}</time>
          </div>

          <p v-if="canDraw" class="pictionary-drawer-answer" aria-live="polite">
            <span>{{ text.room.yourPrompt }}</span>
            <strong>{{ currentPrivateProjection?.answer || text.room.syncingPrompt }}</strong>
          </p>

          <div class="pictionary-canvas" :class="{ 'is-readonly': !canDraw }">
            <canvas ref="canvas" />
            <canvas ref="previewCanvas" class="pictionary-canvas__preview" width="1024" height="768" aria-hidden="true" />
            <div v-if="state?.phase === 'choosing'" class="pictionary-canvas-overlay">
              <template v-if="isDrawer">
                <span class="site-activity-kicker">{{ text.room.chooseThree }}</span>
                <h2>{{ text.room.choosePrompt }}</h2>
                <div class="pictionary-candidate-list">
                  <SiteActivityButton
                    v-for="(candidate, index) in currentPrivateProjection?.candidates ?? []"
                    :key="candidate"
                    @click="chooseWord(index)"
                  >
                    {{ candidate }}
                  </SiteActivityButton>
                </div>
              </template>
              <template v-else>
                <span class="pictionary-canvas-overlay__icon i-ph-hourglass-medium" aria-hidden="true" />
                <h2>{{ text.room.drawerChoosing }}</h2>
              </template>
            </div>
            <div v-if="state?.phase === 'reveal'" class="pictionary-canvas-overlay is-reveal">
              <span class="site-activity-kicker">{{ revealLabel }}</span>
              <h2>{{ revealAnswer }}</h2>
            </div>
            <div v-if="state?.phase === 'finished'" class="pictionary-canvas-overlay is-reveal">
              <span class="site-activity-kicker">{{ text.room.finalScore }}</span>
              <h2>{{ winnerLabel }}</h2>
              <SiteActivityButton variant="primary" @click="emit('openLobby')">
                {{ text.room.playAgain }}
              </SiteActivityButton>
            </div>
          </div>

          <SiteActivityPanel v-if="canDraw" class="pictionary-drawing-tools" tag="div">
            <SiteActivityButton
              v-for="tool in ['pen', 'marker', 'eraser'] as const"
              :key="tool"
              :active="selectedTool === tool"
              selectable
              size="compact"
              @click="selectTool(tool)"
            >
              {{ toolLabel(tool) }}
            </SiteActivityButton>
            <input
              v-if="selectedTool !== 'eraser'"
              v-model="selectedColor"
              class="pictionary-drawing-tools__color"
              type="color"
              :aria-label="text.room.brushColor"
            >
            <label class="pictionary-drawing-size">
              <span>{{ brushSizeLabel }}</span>
              <input v-model.number="selectedBrushSize" type="range" min="1" max="128" step="1" :aria-label="brushSizeLabel">
            </label>
            <SiteActivityButton v-if="isDrawer" size="compact" @click="takeController">
              {{ text.room.takeControl }}
            </SiteActivityButton>
          </SiteActivityPanel>

          <form
            v-if="state?.phase === 'drawing' && !isDrawer && currentPlayer?.status === 'active'"
            class="pictionary-guess-bar"
            @submit.prevent="submitGuess"
          >
            <input v-model="guess" class="site-activity-control" maxlength="64" autocomplete="off" :placeholder="text.room.guessPlaceholder">
            <SiteActivityButton type="submit" variant="primary">
              {{ text.room.guess }}
            </SiteActivityButton>
          </form>
          <p v-if="liveGuess" class="pictionary-live-guess" aria-live="polite">
            {{ liveGuess }}
          </p>
        </div>

        <PictionaryScoreboard
          :current-user-id="currentUserId"
          :is-host="isHost"
          :players="players"
          :warning="fatalError"
          @toggle-mute="setPlayerMuted($event.userId, $event.muted)"
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.pictionary-room {
  overflow: auto;
}

.pictionary-room__fatal {
  display: flex;
  min-height: calc(100% - 44px);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  text-align: center;
}

.pictionary-room__fatal h1,
.pictionary-room__fatal p {
  margin: 0;
}

.pictionary-room__fatal h1 {
  font-size: 18px;
}

.pictionary-room__fatal-icon {
  color: var(--saier-color-danger-text);
  font-size: 36px;
}

.pictionary-room__fatal .site-activity-error {
  max-width: 520px;
}

.pictionary-room__game {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 12px;
  padding-block: 12px 24px;
}

.pictionary-round-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  padding-inline: 4px;
}

.pictionary-round-strip strong {
  display: block;
  margin-top: 3px;
  color: var(--saier-color-text-muted);
  font-size: 11px;
}

.pictionary-round-strip time {
  color: var(--saier-color-warning);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 30px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.pictionary-drawer-answer {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 4px 8px;
  color: var(--saier-color-text-subtle);
  font-size: 11px;
}

.pictionary-drawer-answer strong {
  color: var(--saier-color-warning-text);
  font-size: 15px;
}

.pictionary-canvas {
  position: relative;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  border: 1px solid var(--saier-color-border-strong);
  border-radius: 8px;
  background: var(--saier-color-canvas-paper);
  box-shadow: var(--saier-shadow-panel);
}

.pictionary-canvas canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.pictionary-canvas .pictionary-canvas__preview {
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}

.pictionary-canvas.is-readonly canvas {
  pointer-events: none;
}

.pictionary-canvas-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(255 255 255 / 94%);
  color: #20242b;
  text-align: center;
}

.pictionary-canvas-overlay h2 {
  margin: 8px 0 18px;
  font-size: clamp(22px, 4vw, 36px);
}

.pictionary-canvas-overlay .site-activity-kicker {
  color: #1d4ed8;
}

.pictionary-canvas-overlay__icon {
  color: #2563eb;
  font-size: 36px;
}

.pictionary-candidate-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.pictionary-candidate-list .site-activity-button {
  min-width: 128px;
  min-height: 40px;
  border-color: rgb(32 36 43 / 24%);
  background: rgb(32 36 43 / 6%);
  color: #20242b;
  font-size: 14px;
}

.pictionary-candidate-list .site-activity-button:hover {
  border-color: #2563eb;
  background: rgb(37 99 235 / 12%);
  color: #1d4ed8;
}

.pictionary-drawing-tools,
.pictionary-guess-bar {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.pictionary-drawing-tools {
  align-items: center;
  padding: 6px;
  overflow-x: auto;
}

.pictionary-drawing-tools__color {
  box-sizing: border-box;
  width: 36px;
  height: 32px;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid var(--saier-color-border);
  border-radius: 7px;
  background: var(--saier-color-field);
}

.pictionary-drawing-tools__color:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.pictionary-drawing-size {
  display: grid;
  min-width: 150px;
  align-content: center;
  gap: 2px;
  padding-inline: 8px;
  color: var(--saier-color-text-subtle);
  font-size: 10px;
  font-weight: 650;
}

.pictionary-drawing-size input {
  width: 100%;
  accent-color: var(--saier-color-accent);
}

.pictionary-guess-bar .site-activity-control {
  flex: 1;
}

.pictionary-guess-bar .site-activity-button {
  min-width: 64px;
}

.pictionary-live-guess {
  min-height: 18px;
  margin: 6px 4px 0;
  color: var(--saier-color-text-muted);
  font-size: 11px;
}

@media (max-width: 860px) {
  .pictionary-room__game {
    grid-template-columns: 1fr;
    padding-top: 8px;
  }

  .pictionary-round-strip {
    position: sticky;
    z-index: 20;
    top: 44px;
    background: var(--saier-color-app-background);
  }

  .pictionary-drawing-tools .site-activity-button {
    flex: 0 0 auto;
  }

  .pictionary-guess-bar {
    position: sticky;
    z-index: 20;
    bottom: 8px;
  }
}
</style>
