import type { BlendMode, LayerNodeMoveTarget, SaierProjectFile, SaierStrokeCommit, StrokePatch } from '@saier/core'
import type { Painter } from 'saier'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type {
  AppendRoomOperationOptions,
  UpdateRoomPresenceOptions,
  YunlefunCloudRoomFailure,
  YunlefunCloudRoomOperation,
  YunlefunCloudRoomOperationResult,
  YunlefunCloudRoomOperationType,
  YunlefunCloudRoomResult,
  YunlefunCloudRoomSession,
} from './useYunlefunCloudRooms'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA,
  CLOUD_ROOM_LAYER_COMMAND_SCHEMA,
  createCloudRoomClientOperationId,
  createCloudRoomDocumentCommand,
  createCloudRoomLayerCommand,
  createCloudRoomStrokeCommitPayload,
  createCloudRoomStrokePatchHash,
  deserializeCloudRoomStrokePatch,
  isCloudRoomDocumentCommandPayload,
  isCloudRoomLayerCommandPayload,
  isCloudRoomStrokeCommitPayload,
  serializeCloudRoomStrokePatch,
} from '../utils/cloudRoomOperations'

const POLL_INTERVAL_MS = 1800
const POLL_ERROR_BACKOFF_MS = 5000
const PRESENCE_INTERVAL_MS = 15_000
const CHECKPOINT_OP_INTERVAL = 25
const CHECKPOINT_TIME_WINDOW_MS = 5 * 60_000

export interface UseSiteCloudRoomCollaborationOptions {
  appendOperation: (options: AppendRoomOperationOptions) => Promise<YunlefunCloudRoomOperationResult>
  createPresence?: () => Record<string, unknown>
  createSnapshot?: (project: SaierProjectFile) => Promise<YunlefunCloudRoomResult>
  listOperations: (afterRevision: number, limit?: number) => Promise<YunlefunCloudRoomOperationResult>
  onError?: (reason: YunlefunCloudRoomFailure) => void
  onSnapshotRequired?: (project: SaierProjectFile, revision: number) => Promise<void> | void
  painter: ShallowRef<Painter | undefined>
  refreshLayerThumbnails: () => Promise<void>
  refreshMemory: () => Promise<void>
  refreshNavigatorThumbnail: () => Promise<void>
  session: Readonly<Ref<YunlefunCloudRoomSession | null>>
  updatePresence?: (options?: UpdateRoomPresenceOptions) => Promise<YunlefunCloudRoomResult>
}

export interface SubmitCloudRoomLayerCommandOptions {
  args: Record<string, unknown>
  command: Parameters<typeof createCloudRoomLayerCommand>[0]
}

export interface SubmitCloudRoomDocumentCommandOptions {
  args?: Record<string, unknown>
  command: Parameters<typeof createCloudRoomDocumentCommand>[0]
}

export function useSiteCloudRoomCollaboration(options: UseSiteCloudRoomCollaborationOptions): {
  canSubmit: ComputedRef<boolean>
  isApplyingRemote: Readonly<ShallowRef<boolean>>
  lastAppliedRevision: Readonly<ShallowRef<number>>
  submitDocumentCommand: (command: SubmitCloudRoomDocumentCommandOptions) => Promise<void>
  submitLayerCommand: (command: SubmitCloudRoomLayerCommandOptions) => Promise<void>
  syncNow: () => Promise<void>
} {
  const clientId = createStableClientId()
  const isApplyingRemote = shallowRef(false)
  const lastAppliedRevision = shallowRef(0)
  const canSubmit = computed(() => Boolean(options.session.value && !options.session.value.readOnly))

  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let presenceTimer: ReturnType<typeof setTimeout> | undefined
  let checkpointTimer: ReturnType<typeof setTimeout> | undefined
  let lastCheckpointAt = Date.now()
  let pollInFlight = false
  let presenceInFlight = false
  let checkpointInFlight = false
  let pendingStrokePatch: StrokePatch | undefined
  let pendingStrokePatchQueued = false
  let restoreRecordStrokePatch: (() => void) | undefined

  watch(
    () => options.painter.value,
    (next, previous) => {
      if (previous && previous !== next)
        restoreRecordStrokePatch?.()
      restoreRecordStrokePatch = next ? patchRecordStrokePatch(next) : undefined
    },
    { immediate: true },
  )

  watch(
    () => options.session.value?.room.id,
    () => {
      lastAppliedRevision.value = options.session.value?.room.latestSnapshotRevision ?? 0
      lastCheckpointAt = Date.now()
      schedulePoll(0)
      schedulePresence(0)
      scheduleCheckpoint()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearPoll()
    clearPresence()
    clearCheckpoint()
    restoreRecordStrokePatch?.()
    restoreRecordStrokePatch = undefined
  })

  async function submitLayerCommand(command: SubmitCloudRoomLayerCommandOptions): Promise<void> {
    await submitOperation('layer:command', {
      ...createCloudRoomLayerCommand(command.command, command.args),
    })
  }

  async function submitDocumentCommand(command: SubmitCloudRoomDocumentCommandOptions): Promise<void> {
    await submitOperation('document:command', {
      ...createCloudRoomDocumentCommand(command.command, command.args ?? {}),
    })
  }

  async function syncNow(): Promise<void> {
    await pollOperations()
  }

  function patchRecordStrokePatch(painter: Painter): () => void {
    const original = painter.recordStrokePatch.bind(painter)
    painter.recordStrokePatch = (patch: StrokePatch) => {
      original(patch)
      if (!isApplyingRemote.value) {
        pendingStrokePatch = patch
        queuePendingStrokePatch()
      }
    }
    const handleStrokeCommit = (commit: SaierStrokeCommit) => {
      if (isApplyingRemote.value)
        return

      const patch = pendingStrokePatch
      pendingStrokePatch = undefined
      void submitStrokeCommit(commit, patch)
    }
    painter.emitter.on('stroke:commit', handleStrokeCommit)
    return () => {
      painter.recordStrokePatch = original
      painter.emitter.off('stroke:commit', handleStrokeCommit)
    }
  }

  function queuePendingStrokePatch(): void {
    if (pendingStrokePatchQueued)
      return

    pendingStrokePatchQueued = true
    queueMicrotask(() => {
      pendingStrokePatchQueued = false
      const patch = pendingStrokePatch
      pendingStrokePatch = undefined
      if (patch && !isApplyingRemote.value)
        void submitStrokePatch(patch)
    })
  }

  async function submitStrokeCommit(commit: SaierStrokeCommit, patch: StrokePatch | undefined): Promise<void> {
    if (!canSubmit.value)
      return

    await submitOperation('stroke:commit', {
      ...createCloudRoomStrokeCommitPayload(commit, patch),
    })
  }

  async function submitStrokePatch(patch: StrokePatch): Promise<void> {
    if (!canSubmit.value)
      return

    const serialized = serializeCloudRoomStrokePatch(patch)
    if (!serialized)
      return

    await submitOperation('stroke:commit', {
      patch: serialized,
      patchHash: createCloudRoomStrokePatchHash(serialized),
      schema: serialized.schema,
    })
  }

  async function submitOperation(type: YunlefunCloudRoomOperationType, payload: Record<string, unknown>): Promise<void> {
    if (!canSubmit.value)
      return

    const result = await appendWithRevision(type, payload)
    if (result.ok && result.operation) {
      lastAppliedRevision.value = Math.max(lastAppliedRevision.value, result.operation.revision)
      options.painter.value?.markDocumentSaved()
      scheduleCheckpoint(0)
      return
    }

    if (result.reason === 'revision_conflict') {
      await pollOperations()
      const retry = await appendWithRevision(type, payload)
      if (retry.ok && retry.operation) {
        lastAppliedRevision.value = Math.max(lastAppliedRevision.value, retry.operation.revision)
        options.painter.value?.markDocumentSaved()
        scheduleCheckpoint(0)
        return
      }
      options.onError?.(retry.reason ?? 'backend_unavailable')
      return
    }

    if (result.reason)
      options.onError?.(result.reason)
  }

  function appendWithRevision(type: YunlefunCloudRoomOperationType, payload: Record<string, unknown>): Promise<YunlefunCloudRoomOperationResult> {
    return options.appendOperation({
      baseRevision: lastAppliedRevision.value,
      clientId,
      clientOpId: createCloudRoomClientOperationId(type.replace(':', '-')),
      payload,
      type,
    })
  }

  function schedulePoll(delay = POLL_INTERVAL_MS): void {
    clearPoll()
    if (!options.session.value)
      return

    pollTimer = setTimeout(() => {
      pollTimer = undefined
      void pollOperations()
    }, delay)
  }

  function clearPoll(): void {
    if (pollTimer === undefined)
      return
    clearTimeout(pollTimer)
    pollTimer = undefined
  }

  function schedulePresence(delay = PRESENCE_INTERVAL_MS): void {
    clearPresence()
    if (!options.session.value || !options.updatePresence)
      return

    presenceTimer = setTimeout(() => {
      presenceTimer = undefined
      void sendPresence()
    }, delay)
  }

  function clearPresence(): void {
    if (presenceTimer === undefined)
      return
    clearTimeout(presenceTimer)
    presenceTimer = undefined
  }

  async function sendPresence(): Promise<void> {
    if (presenceInFlight || !options.session.value || !options.updatePresence)
      return

    presenceInFlight = true
    try {
      const result = await options.updatePresence({
        presence: options.createPresence?.() ?? {},
      })
      if (!result.ok && result.reason)
        options.onError?.(result.reason)
    }
    catch {
      options.onError?.('backend_unavailable')
    }
    finally {
      presenceInFlight = false
      schedulePresence()
    }
  }

  function scheduleCheckpoint(delay = CHECKPOINT_TIME_WINDOW_MS): void {
    clearCheckpoint()
    if (!options.session.value || !options.createSnapshot)
      return

    checkpointTimer = setTimeout(() => {
      checkpointTimer = undefined
      void createCheckpointIfNeeded()
    }, delay)
  }

  function clearCheckpoint(): void {
    if (checkpointTimer === undefined)
      return
    clearTimeout(checkpointTimer)
    checkpointTimer = undefined
  }

  async function createCheckpointIfNeeded(): Promise<void> {
    if (checkpointInFlight || !options.createSnapshot || !canSubmit.value)
      return

    const session = options.session.value
    const painter = options.painter.value
    if (!session || !painter)
      return

    const headRevision = Math.max(lastAppliedRevision.value, session.room.headRevision)
    const latestSnapshotRevision = session.room.latestSnapshotRevision
    const hasPendingSnapshotWork = headRevision > latestSnapshotRevision
    const opsSinceSnapshot = headRevision - latestSnapshotRevision
    const elapsed = Date.now() - lastCheckpointAt
    const shouldCheckpoint = hasPendingSnapshotWork
      && (opsSinceSnapshot >= CHECKPOINT_OP_INTERVAL || elapsed >= CHECKPOINT_TIME_WINDOW_MS)

    if (!shouldCheckpoint) {
      scheduleCheckpoint(Math.max(1000, CHECKPOINT_TIME_WINDOW_MS - elapsed))
      return
    }

    checkpointInFlight = true
    try {
      const result = await options.createSnapshot(painter.exportProject())
      if (result.ok) {
        lastCheckpointAt = Date.now()
        scheduleCheckpoint()
        return
      }
      if (result.reason)
        options.onError?.(result.reason)
      scheduleCheckpoint(POLL_ERROR_BACKOFF_MS)
    }
    catch {
      options.onError?.('backend_unavailable')
      scheduleCheckpoint(POLL_ERROR_BACKOFF_MS)
    }
    finally {
      checkpointInFlight = false
    }
  }

  async function pollOperations(): Promise<void> {
    if (pollInFlight || !options.session.value)
      return

    pollInFlight = true
    try {
      const result = await options.listOperations(lastAppliedRevision.value, 200)
      if (!result.ok) {
        if (result.reason)
          options.onError?.(result.reason)
        schedulePoll(POLL_ERROR_BACKOFF_MS)
        return
      }

      if (result.snapshotRequired) {
        if (!result.project || result.snapshotRevision === undefined || !options.onSnapshotRequired) {
          options.onError?.('invalid_snapshot')
          schedulePoll(POLL_ERROR_BACKOFF_MS)
          return
        }

        isApplyingRemote.value = true
        try {
          await options.onSnapshotRequired(result.project, result.snapshotRevision)
          lastAppliedRevision.value = Math.max(lastAppliedRevision.value, result.snapshotRevision)
        }
        finally {
          isApplyingRemote.value = false
        }
      }

      for (const operation of result.operations ?? [])
        await applyOperation(operation)

      if (result.nextRevision !== undefined)
        lastAppliedRevision.value = Math.max(lastAppliedRevision.value, result.nextRevision)
      scheduleCheckpoint(0)
      schedulePoll()
    }
    catch {
      options.onError?.('backend_unavailable')
      schedulePoll(POLL_ERROR_BACKOFF_MS)
    }
    finally {
      pollInFlight = false
    }
  }

  async function applyOperation(operation: YunlefunCloudRoomOperation): Promise<void> {
    if (operation.revision <= lastAppliedRevision.value)
      return

    if (operation.clientId !== clientId) {
      if (operation.type === 'stroke:commit')
        await applyStrokeOperation(operation)
      else if (operation.type === 'layer:command')
        await applyLayerCommand(operation.payload)
      else if (operation.type === 'document:command')
        await applyDocumentCommand(operation.payload)
    }

    lastAppliedRevision.value = Math.max(lastAppliedRevision.value, operation.revision)
  }

  async function applyStrokeOperation(operation: YunlefunCloudRoomOperation): Promise<void> {
    const painter = options.painter.value
    if (!painter)
      return

    isApplyingRemote.value = true
    try {
      if (isCloudRoomStrokeCommitPayload(operation.payload)) {
        try {
          painter.strokeRecording.replayStroke(operation.payload.commit, { recordHistory: false })
          painter.flushSurfaceUploads()
          painter.markDocumentSaved()
          await refreshPainterDerivedUi()
          return
        }
        catch {
          const fallback = deserializeCloudRoomStrokePatch(operation.payload.patch)
          if (fallback) {
            applyStrokePatch(painter, fallback)
            await refreshPainterDerivedUi()
          }
          return
        }
      }

      const patch = deserializeCloudRoomStrokePatch(operation.payload.patch)
      if (!patch)
        return

      applyStrokePatch(painter, patch)
      await refreshPainterDerivedUi()
    }
    finally {
      isApplyingRemote.value = false
    }
  }

  function applyStrokePatch(painter: Painter, patch: StrokePatch): void {
    painter.surface.applyPatch(patch, 'redo')
    refreshDerivedDisplays(painter, patch)
    painter.flushSurfaceUploads()
    painter.markDocumentSaved()
  }

  async function applyLayerCommand(payload: Record<string, unknown>): Promise<void> {
    if (!isCloudRoomLayerCommandPayload(payload))
      return

    const painter = options.painter.value
    if (!painter)
      return

    isApplyingRemote.value = true
    try {
      const args = payload.args
      switch (payload.command) {
        case 'add':
          painter.controller.layer.add({
            id: stringArg(args, 'id'),
            index: numberArg(args, 'index'),
            label: stringArg(args, 'label'),
            parentId: nullableStringArg(args, 'parentId'),
          })
          break
        case 'add-group':
          painter.controller.layer.addGroup({
            id: stringArg(args, 'id'),
            index: numberArg(args, 'index'),
            label: stringArg(args, 'label'),
            parentId: nullableStringArg(args, 'parentId'),
          })
          break
        case 'add-mask':
          painter.controller.layer.addMask(requiredStringArg(args, 'id'), stringArg(args, 'maskId'))
          break
        case 'move':
          painter.controller.layer.move(requiredStringArg(args, 'id'), requiredNumberArg(args, 'toIndex'))
          break
        case 'move-node':
          painter.controller.layer.moveNode(requiredStringArg(args, 'id'), requiredMoveTargetArg(args, 'target'))
          break
        case 'remove':
          painter.controller.layer.remove(requiredStringArg(args, 'id'))
          break
        case 'remove-mask':
          painter.controller.layer.removeMask(requiredStringArg(args, 'id'))
          break
        case 'set-blend-mode':
          painter.controller.layer.setBlendMode(requiredStringArg(args, 'id'), requiredBlendModeArg(args, 'blendMode'))
          break
        case 'set-clip':
          painter.controller.layer.setClip(requiredStringArg(args, 'id'), requiredBooleanArg(args, 'clip'))
          break
        case 'set-group-collapsed':
          painter.controller.layer.setGroupCollapsed(requiredStringArg(args, 'id'), requiredBooleanArg(args, 'collapsed'))
          break
        case 'set-label':
          painter.controller.layer.setLabel(requiredStringArg(args, 'id'), requiredStringArg(args, 'label'))
          break
        case 'set-lock-alpha':
          painter.controller.layer.setLockAlpha(requiredStringArg(args, 'id'), requiredBooleanArg(args, 'lockAlpha'))
          break
        case 'set-mask-enabled':
          painter.controller.layer.setMaskEnabled(requiredStringArg(args, 'id'), requiredBooleanArg(args, 'enabled'))
          break
        case 'set-opacity':
          painter.controller.layer.setOpacity(requiredStringArg(args, 'id'), requiredNumberArg(args, 'opacity'))
          break
        case 'set-visible':
          painter.controller.layer.setVisible(requiredStringArg(args, 'id'), requiredBooleanArg(args, 'visible'))
          break
        case 'ungroup':
          painter.controller.layer.ungroup(requiredStringArg(args, 'id'))
          break
      }
      painter.markDocumentSaved()
      await refreshPainterDerivedUi()
    }
    finally {
      isApplyingRemote.value = false
    }
  }

  async function applyDocumentCommand(payload: Record<string, unknown>): Promise<void> {
    if (!isCloudRoomDocumentCommandPayload(payload))
      return

    const painter = options.painter.value
    if (!painter)
      return

    isApplyingRemote.value = true
    try {
      if (payload.command === 'clear-canvas')
        painter.clearCanvas()
      painter.markDocumentSaved()
      await refreshPainterDerivedUi()
    }
    finally {
      isApplyingRemote.value = false
    }
  }

  async function refreshPainterDerivedUi(): Promise<void> {
    await Promise.all([
      options.refreshLayerThumbnails(),
      options.refreshMemory(),
      options.refreshNavigatorThumbnail(),
    ])
  }

  return {
    canSubmit,
    isApplyingRemote,
    lastAppliedRevision,
    submitDocumentCommand,
    submitLayerCommand,
    syncNow,
  }
}

function createStableClientId(): string {
  if (typeof sessionStorage !== 'undefined') {
    const key = 'saier:cloud-room:client-id'
    const existing = sessionStorage.getItem(key)
    if (existing)
      return existing
    const next = createCloudRoomClientOperationId('client')
    sessionStorage.setItem(key, next)
    return next
  }
  return createCloudRoomClientOperationId('client')
}

function refreshDerivedDisplays(painter: Painter, patch: StrokePatch): void {
  const surface = painter.surface as Painter['surface'] & {
    refreshDerivedDisplays?: (dirtyRect?: StrokePatch['rect']) => void
  }
  surface.refreshDerivedDisplays?.(patch.rect)
}

function requiredBooleanArg(args: Record<string, unknown>, name: string): boolean {
  const value = args[name]
  if (typeof value !== 'boolean')
    throw new TypeError(`Invalid cloud room command boolean arg: ${name}`)
  return value
}

function requiredBlendModeArg(args: Record<string, unknown>, name: string): BlendMode {
  const value = requiredStringArg(args, name)
  return value as BlendMode
}

function requiredMoveTargetArg(args: Record<string, unknown>, name: string): LayerNodeMoveTarget {
  const value = args[name]
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`Invalid cloud room command move target arg: ${name}`)
  const record = value as Record<string, unknown>
  return {
    index: requiredNumberArg(record, 'index'),
    parentId: nullableStringArg(record, 'parentId') ?? null,
  }
}

function requiredNumberArg(args: Record<string, unknown>, name: string): number {
  const value = args[name]
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Invalid cloud room command number arg: ${name}`)
  return value
}

function requiredStringArg(args: Record<string, unknown>, name: string): string {
  const value = stringArg(args, name)
  if (!value)
    throw new TypeError(`Invalid cloud room command string arg: ${name}`)
  return value
}

function nullableStringArg(args: Record<string, unknown>, name: string): string | null | undefined {
  return args[name] === null ? null : stringArg(args, name)
}

function numberArg(args: Record<string, unknown>, name: string): number | undefined {
  return typeof args[name] === 'number' && Number.isFinite(args[name]) ? args[name] : undefined
}

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createCloudRoomAddLayerArgs(args: {
  id: string
  index?: number
  label: string
  parentId?: string | null
}): Record<string, unknown> {
  return {
    id: args.id,
    index: args.index,
    label: args.label,
    parentId: args.parentId ?? null,
  }
}

export function createCloudRoomLayerBooleanArgs(id: string, name: string, value: boolean): Record<string, unknown> {
  return { id, [name]: value }
}

export function createCloudRoomLayerValueArgs(id: string, name: string, value: number | string): Record<string, unknown> {
  return { id, [name]: value }
}

export function createCloudRoomMoveNodeArgs(id: string, target: LayerNodeMoveTarget): Record<string, unknown> {
  return {
    id,
    target: {
      index: target.index,
      parentId: target.parentId,
    },
  }
}

export function isCloudRoomDocumentCommandSchema(value: unknown): boolean {
  return value === CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA
}

export function isCloudRoomLayerCommandSchema(value: unknown): boolean {
  return value === CLOUD_ROOM_LAYER_COMMAND_SCHEMA
}
