import type { SaierProjectFile } from '@saier/core'
import type {
  YunlefunCloudbaseApp,
  YunlefunCloudbaseUploadProgress,
} from './useYunlefunAuth'
import { SAIER_PROJECT_FORMAT } from '@saier/core'
import { computed, readonly } from 'vue'
import { useRuntimeConfig, useState } from '#imports'
import { normalizeYunlefunCloudErrorMessage } from '../utils/yunlefunCloudErrors'
import { useYunlefunAuth } from './useYunlefunAuth'

const DEFAULT_ROOM_API_FUNCTION_NAME = 'saier-room-api'
const SAIER_APP_ID = 'saier'
const DEFAULT_ROOM_SNAPSHOT_MAX_BYTES = 200 * 1024 * 1024
const DEFAULT_ROOM_FUNCTION_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024

export type YunlefunCloudRoomStatus
  = | 'idle'
    | 'creating'
    | 'joining'
    | 'leaving'
    | 'syncing'
    | 'sharing'
    | 'error'

export type YunlefunCloudRoomFailure
  = | 'backend_unavailable'
    | 'forbidden'
    | 'invalid_snapshot'
    | 'not_authenticated'
    | 'revision_conflict'
    | 'room_not_found'
    | 'too_large'

export type YunlefunCloudRoomRole = 'editor' | 'owner' | 'viewer'
export type YunlefunCloudRoomVisibility = 'link' | 'private'
export type YunlefunCloudRoomMode = 'driver' | 'multi-editor' | 'viewer'
export type YunlefunCloudRoomOperationType
  = | 'document:command'
    | 'layer:command'
    | 'project:snapshot'
    | 'stroke:append'
    | 'stroke:commit'
    | 'stroke:start'

export interface YunlefunCloudRoom {
  createdAt: number
  driverUserId?: string
  headRevision: number
  id: string
  latestSnapshotRevision: number
  mode: YunlefunCloudRoomMode
  ownerUserId: string
  title: string
  updatedAt: number
  visibility: YunlefunCloudRoomVisibility
}

export interface YunlefunCloudRoomMember {
  displayName?: string
  lastSeenAt: number
  online: boolean
  presence?: Record<string, unknown>
  role: YunlefunCloudRoomRole
  roomId: string
  userId: string
}

export interface YunlefunCloudRoomSession {
  inviteToken?: string
  members: YunlefunCloudRoomMember[]
  readOnly: boolean
  role: YunlefunCloudRoomRole
  room: YunlefunCloudRoom
  shareUrl: string
}

export interface YunlefunCloudRoomLinkTarget {
  inviteToken?: string
  roomId: string
}

export interface YunlefunCloudRoomLabels {
  backendUnavailable: string
  forbidden: string
  invalidSnapshot: string
  notAuthenticated: string
  revisionConflict: string
  roomNotFound: string
  tooLarge: string
}

export interface YunlefunCloudRoomResult {
  message?: string
  ok: boolean
  project?: SaierProjectFile
  reason?: YunlefunCloudRoomFailure
  session?: YunlefunCloudRoomSession
}

export interface YunlefunCloudRoomOperation {
  baseRevision: number
  clientId: string
  clientOpId: string
  createdAt: number
  payload: Record<string, unknown>
  revision: number
  roomId: string
  type: YunlefunCloudRoomOperationType
  userId: string
}

export interface YunlefunCloudRoomOperationResult extends YunlefunCloudRoomResult {
  nextRevision?: number
  operation?: YunlefunCloudRoomOperation
  operations?: YunlefunCloudRoomOperation[]
  snapshotRequired?: boolean
  snapshotRevision?: number
}

export interface UpdateRoomPresenceOptions {
  presence?: Record<string, unknown>
}

export interface SetRoomMemberRoleOptions {
  role: Exclude<YunlefunCloudRoomRole, 'owner'>
  userId: string
}

export interface SetRoomModeOptions {
  driverUserId?: string
  mode: YunlefunCloudRoomMode
}

interface CreateRoomOptions {
  title: string
  visibility: YunlefunCloudRoomVisibility
}

export interface AppendRoomOperationOptions {
  baseRevision: number
  clientId: string
  clientOpId: string
  payload: Record<string, unknown>
  type: YunlefunCloudRoomOperationType
}

interface RoomSnapshotUploadTarget {
  fileName: string
  reservationId: string
  storageKey: string
}

interface ReserveRoomSnapshotUploadResult {
  inviteToken?: string
  maxBytes: number
  room: YunlefunCloudRoom
  shareUrl?: string
  upload: RoomSnapshotUploadTarget
}

interface RoomSnapshotDownload {
  downloadUrl?: string
  maxBytes: number
  text?: string
}

interface FinalizeRoomSnapshotUploadResult {
  session: YunlefunCloudRoomSession
}

interface FinalizeRoomCheckpointSnapshotResult {
  room: YunlefunCloudRoom
}

interface AppendRoomOperationResult {
  deduped: boolean
  operation: YunlefunCloudRoomOperation
  room: YunlefunCloudRoom
}

interface JoinRoomResult {
  session: YunlefunCloudRoomSession
  snapshot: RoomSnapshotDownload
}

interface ListRoomOperationsResult {
  items: YunlefunCloudRoomOperation[]
  nextRevision: number
  room?: YunlefunCloudRoom
  snapshot?: RoomSnapshotDownload
  snapshotRequired: boolean
  snapshotRevision?: number
}

interface UpdateRoomPresenceResult {
  expiresAt?: number
  members?: YunlefunCloudRoomMember[]
  room?: YunlefunCloudRoom
}

interface SetRoomMemberRoleResult {
  members: YunlefunCloudRoomMember[]
  room: YunlefunCloudRoom
}

interface SetRoomModeResult {
  room: YunlefunCloudRoom
}

interface YunlefunCloudRoomRuntimeConfig {
  public: {
    saierCloudRoomApiFunctionName?: string
  }
}

export function useYunlefunCloudRooms() {
  const config = useRuntimeConfig() as unknown as YunlefunCloudRoomRuntimeConfig
  const {
    account,
    getCloudbaseApp,
    isAuthenticated,
    signIn,
  } = useYunlefunAuth()

  const session = useState<YunlefunCloudRoomSession | null>('yunlefun:cloud-rooms:session', () => null)
  const status = useState<YunlefunCloudRoomStatus>('yunlefun:cloud-rooms:status', () => 'idle')
  const lastFailure = useState<YunlefunCloudRoomFailure | null>('yunlefun:cloud-rooms:last-failure', () => null)
  const lastError = useState<string>('yunlefun:cloud-rooms:last-error', () => '')
  const uploadProgress = useState<number>('yunlefun:cloud-rooms:upload-progress', () => 0)

  const isBusy = computed(() => status.value !== 'idle' && status.value !== 'error')
  const isReadOnly = computed(() => session.value?.readOnly === true)
  const roomApiFunctionName = computed(() =>
    stringValue(config.public.saierCloudRoomApiFunctionName) ?? DEFAULT_ROOM_API_FUNCTION_NAME)
  const shareUrl = computed(() => session.value?.shareUrl ?? '')

  async function ensureSignedIn(): Promise<boolean> {
    if (isAuthenticated.value)
      return true

    const ok = await signIn('interactive')
    if (!ok) {
      setFailure('not_authenticated')
      return false
    }
    return true
  }

  async function createRoom(project: SaierProjectFile, options: CreateRoomOptions): Promise<YunlefunCloudRoomResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'creating'
    uploadProgress.value = 0
    clearFailure()

    const payload = JSON.stringify(project)
    const blob = new Blob([payload], { type: 'application/json' })
    if (blob.size > DEFAULT_ROOM_SNAPSHOT_MAX_BYTES) {
      setFailure('too_large')
      return failureResult('too_large')
    }

    let cleanupApp: YunlefunCloudbaseApp | undefined
    let uploadedFileID: string | undefined

    try {
      const app = await ensureCloudbaseApp()
      cleanupApp = app
      if (!app.uploadFile)
        throw createFailureError('backend_unavailable')

      const reserved = parseReserveRoomSnapshotUploadResult(await callRoomApi('createRoomSnapshotUpload', {
        appId: SAIER_APP_ID,
        contentType: 'application/json',
        fileName: `${safeFileName(options.title)}.saier.room-snapshot.json`,
        format: project.format,
        mode: 'viewer',
        sizeBytes: blob.size,
        title: options.title,
        visibility: options.visibility,
      }))
      if (!reserved)
        throw createFailureError('backend_unavailable')
      if (blob.size > reserved.maxBytes)
        throw createFailureError('too_large')

      const file = new File([blob], reserved.upload.fileName, { type: 'application/json' })
      let finalized: FinalizeRoomSnapshotUploadResult | undefined

      try {
        const upload = await app.uploadFile({
          cloudPath: reserved.upload.storageKey,
          filePath: file,
          onUploadProgress(progress: YunlefunCloudbaseUploadProgress) {
            if (progress.total && progress.total > 0)
              uploadProgress.value = Math.max(0, Math.min(1, progress.loaded / progress.total))
          },
        })
        if (!upload.fileID)
          throw createFailureError('backend_unavailable')
        uploadedFileID = upload.fileID

        finalized = parseFinalizeRoomSnapshotUploadResult(await callRoomApi('finalizeRoomSnapshotUpload', {
          fileId: upload.fileID,
          reservationId: reserved.upload.reservationId,
          roomId: reserved.room.id,
          sizeBytes: blob.size,
          storageKey: reserved.upload.storageKey,
        }))
      }
      catch (uploadError) {
        if (blob.size > DEFAULT_ROOM_FUNCTION_SNAPSHOT_MAX_BYTES)
          throw uploadError

        finalized = parseFinalizeRoomSnapshotUploadResult(await callRoomApi('finalizeRoomSnapshotText', {
          reservationId: reserved.upload.reservationId,
          roomId: reserved.room.id,
          sizeBytes: blob.size,
          storageKey: reserved.upload.storageKey,
          text: payload,
        }))
      }
      if (!finalized)
        throw createFailureError('backend_unavailable')

      session.value = withResolvedShareUrl(finalized.session)
      uploadProgress.value = 1
      status.value = 'idle'
      return { ok: true, session: session.value }
    }
    catch (error) {
      if (uploadedFileID)
        await cleanupUploadedFile(cleanupApp, uploadedFileID)
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function createCheckpointSnapshot(project: SaierProjectFile): Promise<YunlefunCloudRoomResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    const payload = JSON.stringify(project)
    const blob = new Blob([payload], { type: 'application/json' })
    if (blob.size > DEFAULT_ROOM_SNAPSHOT_MAX_BYTES)
      return failureResult('too_large')

    let cleanupApp: YunlefunCloudbaseApp | undefined
    let uploadedFileID: string | undefined

    try {
      const app = await ensureCloudbaseApp()
      cleanupApp = app
      if (!app.uploadFile)
        throw createFailureError('backend_unavailable')

      const reserved = parseReserveRoomSnapshotUploadResult(await callRoomApi('createSnapshotUpload', {
        appId: SAIER_APP_ID,
        contentType: 'application/json',
        fileName: `${safeFileName(room.title)}-r${room.headRevision}.saier.room-snapshot.json`,
        format: project.format,
        roomId: room.id,
        sizeBytes: blob.size,
      }))
      if (!reserved)
        throw createFailureError('backend_unavailable')
      if (blob.size > reserved.maxBytes)
        throw createFailureError('too_large')

      const file = new File([blob], reserved.upload.fileName, { type: 'application/json' })
      let finalized: FinalizeRoomCheckpointSnapshotResult | undefined

      try {
        const upload = await app.uploadFile({
          cloudPath: reserved.upload.storageKey,
          filePath: file,
        })
        if (!upload.fileID)
          throw createFailureError('backend_unavailable')
        uploadedFileID = upload.fileID

        finalized = parseFinalizeRoomCheckpointSnapshotResult(await callRoomApi('finalizeSnapshotUpload', {
          fileId: upload.fileID,
          reservationId: reserved.upload.reservationId,
          roomId: room.id,
          sizeBytes: blob.size,
          storageKey: reserved.upload.storageKey,
        }))
      }
      catch (uploadError) {
        if (blob.size > DEFAULT_ROOM_FUNCTION_SNAPSHOT_MAX_BYTES)
          throw uploadError

        finalized = parseFinalizeRoomCheckpointSnapshotResult(await callRoomApi('finalizeSnapshotText', {
          reservationId: reserved.upload.reservationId,
          roomId: room.id,
          sizeBytes: blob.size,
          storageKey: reserved.upload.storageKey,
          text: payload,
        }))
      }
      if (!finalized)
        throw createFailureError('backend_unavailable')

      updateSessionRoom(finalized.room)
      return { ok: true, session: session.value ?? undefined }
    }
    catch (error) {
      if (uploadedFileID)
        await cleanupUploadedFile(cleanupApp, uploadedFileID)
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function joinRoom(target: string | YunlefunCloudRoomLinkTarget): Promise<YunlefunCloudRoomResult> {
    const parsedTarget = typeof target === 'string' ? parseCloudRoomLink(target) : target
    if (!parsedTarget)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'joining'
    clearFailure()

    try {
      const joined = parseJoinRoomResult(await callRoomApi('joinRoom', {
        inviteToken: parsedTarget.inviteToken,
        roomId: parsedTarget.roomId,
      }))
      if (!joined)
        throw createFailureError('room_not_found')

      const text = await readSnapshotText(joined.snapshot)
      const project = parseProject(text)
      if (!project)
        throw createFailureError('invalid_snapshot')

      session.value = withResolvedShareUrl(joined.session)
      status.value = 'idle'
      return { ok: true, project, session: session.value }
    }
    catch (error) {
      const reason = mapRoomError(error, 'room_not_found')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  function leaveRoom(): YunlefunCloudRoomResult {
    status.value = 'leaving'
    session.value = null
    status.value = 'idle'
    return { ok: true }
  }

  function updateSessionRoom(room: YunlefunCloudRoom): void {
    if (!session.value || session.value.room.id !== room.id)
      return
    session.value = {
      ...session.value,
      readOnly: !canSubmitRoomOperation(room, session.value.role, account.value?.uid),
      room,
    }
  }

  function updateSessionMembers(members: YunlefunCloudRoomMember[]): void {
    if (!session.value)
      return
    session.value = {
      ...session.value,
      members,
    }
  }

  async function appendOperation(options: AppendRoomOperationOptions): Promise<YunlefunCloudRoomOperationResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'syncing'
    clearFailure()

    try {
      const appended = parseAppendRoomOperationResult(await callRoomApi('appendOperation', {
        baseRevision: options.baseRevision,
        clientId: options.clientId,
        clientOpId: options.clientOpId,
        payload: options.payload,
        roomId: room.id,
        type: options.type,
      }))
      if (!appended)
        throw createFailureError('backend_unavailable')

      updateSessionRoom(appended.room)
      status.value = 'idle'
      return {
        ok: true,
        operation: appended.operation,
        session: session.value ?? undefined,
      }
    }
    catch (error) {
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function listOperations(afterRevision: number, limit = 200): Promise<YunlefunCloudRoomOperationResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'syncing'
    clearFailure()

    try {
      const listed = parseListRoomOperationsResult(await callRoomApi('listOperations', {
        afterRevision,
        limit,
        roomId: room.id,
      }))
      if (!listed)
        throw createFailureError('backend_unavailable')

      let project: SaierProjectFile | undefined
      if (listed.snapshotRequired) {
        if (!listed.snapshot || listed.snapshotRevision === undefined)
          throw createFailureError('invalid_snapshot')
        project = parseProject(await readSnapshotText(listed.snapshot))
        if (!project)
          throw createFailureError('invalid_snapshot')
      }

      if (listed.room)
        updateSessionRoom(listed.room)

      status.value = 'idle'
      return {
        nextRevision: listed.nextRevision,
        ok: true,
        operations: listed.items,
        project,
        session: session.value ?? undefined,
        snapshotRequired: listed.snapshotRequired,
        snapshotRevision: listed.snapshotRevision,
      }
    }
    catch (error) {
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function updatePresence(options: UpdateRoomPresenceOptions = {}): Promise<YunlefunCloudRoomResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    try {
      const updated = parseUpdateRoomPresenceResult(await callRoomApi('updatePresence', {
        presence: options.presence ?? {},
        roomId: room.id,
      }))
      if (updated?.room)
        updateSessionRoom(updated.room)
      if (updated?.members)
        updateSessionMembers(updated.members)
      return {
        ok: true,
        session: session.value ?? undefined,
      }
    }
    catch (error) {
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function setMemberRole(options: SetRoomMemberRoleOptions): Promise<YunlefunCloudRoomResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'syncing'
    clearFailure()

    try {
      const updated = parseSetRoomMemberRoleResult(await callRoomApi('setMemberRole', {
        role: options.role,
        roomId: room.id,
        userId: options.userId,
      }))
      if (!updated)
        throw createFailureError('backend_unavailable')

      updateSessionRoom(updated.room)
      updateSessionMembers(updated.members)
      status.value = 'idle'
      return { ok: true, session: session.value ?? undefined }
    }
    catch (error) {
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function setRoomMode(options: SetRoomModeOptions): Promise<YunlefunCloudRoomResult> {
    const room = session.value?.room
    if (!room)
      return failureResult('room_not_found')
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'syncing'
    clearFailure()

    try {
      const updated = parseSetRoomModeResult(await callRoomApi('setRoomMode', {
        driverUserId: options.driverUserId,
        mode: options.mode,
        roomId: room.id,
      }))
      if (!updated)
        throw createFailureError('backend_unavailable')

      updateSessionRoom(updated.room)
      status.value = 'idle'
      return { ok: true, session: session.value ?? undefined }
    }
    catch (error) {
      const reason = mapRoomError(error, 'backend_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  function failureMessage(labels: YunlefunCloudRoomLabels): string {
    if (lastError.value)
      return lastError.value
    if (!lastFailure.value)
      return ''

    switch (lastFailure.value) {
      case 'backend_unavailable':
        return labels.backendUnavailable
      case 'forbidden':
        return labels.forbidden
      case 'invalid_snapshot':
        return labels.invalidSnapshot
      case 'not_authenticated':
        return labels.notAuthenticated
      case 'revision_conflict':
        return labels.revisionConflict
      case 'room_not_found':
        return labels.roomNotFound
      case 'too_large':
        return labels.tooLarge
    }
  }

  async function ensureCloudbaseApp(): Promise<YunlefunCloudbaseApp> {
    const app = await getCloudbaseApp()
    if (!app)
      throw createFailureError('backend_unavailable')
    return app
  }

  async function callRoomApi(action: string, data: Record<string, unknown>): Promise<unknown> {
    const app = await ensureCloudbaseApp()
    if (!app.callFunction)
      throw createFailureError('backend_unavailable')

    const response = await app.callFunction({
      name: roomApiFunctionName.value,
      data: { action, ...data },
    })
    if (response.result === undefined)
      throw createFailureError('backend_unavailable')
    return response.result
  }

  function clearFailure(): void {
    lastFailure.value = null
    lastError.value = ''
  }

  function setFailure(reason: YunlefunCloudRoomFailure, error?: unknown): void {
    lastFailure.value = reason
    const message = normalizeYunlefunCloudErrorMessage(error)
    lastError.value = message && !isRoomFailure(message) && reason === 'backend_unavailable'
      ? message
      : ''
    status.value = 'error'
  }

  return {
    appendOperation,
    createCheckpointSnapshot,
    createRoom,
    failureMessage,
    isBusy,
    isReadOnly,
    joinRoom,
    leaveRoom,
    listOperations,
    session: readonly(session),
    setMemberRole,
    setRoomMode,
    shareUrl,
    status: readonly(status),
    updatePresence,
    uploadProgress: readonly(uploadProgress),
  }
}

export function parseCloudRoomLink(value: string): YunlefunCloudRoomLinkTarget | undefined {
  const trimmed = value.trim()
  if (!trimmed)
    return undefined

  try {
    const url = new URL(trimmed, import.meta.client ? window.location.href : 'https://saier.local/')
    const roomId = url.searchParams.get('room') ?? url.searchParams.get('roomId')
    const inviteToken = url.searchParams.get('invite') ?? undefined
    if (roomId)
      return { inviteToken, roomId }
  }
  catch {
    return undefined
  }

  return /^[\w-]{6,128}$/.test(trimmed) ? { roomId: trimmed } : undefined
}

function parseReserveRoomSnapshotUploadResult(value: unknown): ReserveRoomSnapshotUploadResult | undefined {
  const record = asRecord(value)
  const room = parseRoom(record?.room)
  const upload = parseRoomSnapshotUploadTarget(record?.upload)
  if (!room || !upload)
    return undefined

  return {
    inviteToken: stringValue(record?.inviteToken),
    maxBytes: numberValue(record?.maxBytes) ?? DEFAULT_ROOM_SNAPSHOT_MAX_BYTES,
    room,
    shareUrl: stringValue(record?.shareUrl),
    upload,
  }
}

function parseFinalizeRoomSnapshotUploadResult(value: unknown): FinalizeRoomSnapshotUploadResult | undefined {
  const session = parseRoomSession(asRecord(value)?.session)
  return session ? { session } : undefined
}

function parseFinalizeRoomCheckpointSnapshotResult(value: unknown): FinalizeRoomCheckpointSnapshotResult | undefined {
  const room = parseRoom(asRecord(value)?.room)
  return room ? { room } : undefined
}

function parseAppendRoomOperationResult(value: unknown): AppendRoomOperationResult | undefined {
  const record = asRecord(value)
  const operation = parseRoomOperation(record?.operation)
  const room = parseRoom(record?.room)
  const deduped = booleanValue(record?.deduped) ?? false
  return operation && room ? { deduped, operation, room } : undefined
}

function parseJoinRoomResult(value: unknown): JoinRoomResult | undefined {
  const record = asRecord(value)
  const session = parseRoomSession(record?.session)
  const snapshot = parseRoomSnapshotDownload(record?.snapshot)
  return session && snapshot ? { session, snapshot } : undefined
}

function parseListRoomOperationsResult(value: unknown): ListRoomOperationsResult | undefined {
  const record = asRecord(value)
  const items = arrayValue(record?.items)
    ?.map(parseRoomOperation)
    .filter(isRoomOperation)
  const nextRevision = numberValue(record?.nextRevision)
  const snapshotRequired = booleanValue(record?.snapshotRequired) ?? false
  const snapshotRevision = numberValue(record?.snapshotRevision)
  const snapshot = parseRoomSnapshotDownload(record?.snapshot)
  const room = parseRoom(record?.room)
  if (!items || nextRevision === undefined)
    return undefined
  if (snapshotRequired && (snapshotRevision === undefined || !snapshot))
    return undefined

  return {
    items,
    nextRevision,
    room,
    snapshot,
    snapshotRequired,
    snapshotRevision,
  }
}

function parseUpdateRoomPresenceResult(value: unknown): UpdateRoomPresenceResult | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const members = arrayValue(record.members)
    ?.map(parseRoomMember)
    .filter(isRoomMember)

  return {
    expiresAt: numberValue(record.expiresAt),
    members,
    room: parseRoom(record.room),
  }
}

function parseSetRoomMemberRoleResult(value: unknown): SetRoomMemberRoleResult | undefined {
  const record = asRecord(value)
  const room = parseRoom(record?.room)
  const members = arrayValue(record?.members)
    ?.map(parseRoomMember)
    .filter(isRoomMember)
  return room && members ? { members, room } : undefined
}

function parseSetRoomModeResult(value: unknown): SetRoomModeResult | undefined {
  const room = parseRoom(asRecord(value)?.room)
  return room ? { room } : undefined
}

function parseRoomSession(value: unknown): YunlefunCloudRoomSession | undefined {
  const record = asRecord(value)
  const room = parseRoom(record?.room)
  const role = parseRoomRole(record?.role)
  const members = arrayValue(record?.members)
    ?.map(parseRoomMember)
    .filter(isRoomMember)
  if (!room || !role || !members)
    return undefined

  return {
    inviteToken: stringValue(record?.inviteToken),
    members,
    readOnly: booleanValue(record?.readOnly) ?? role === 'viewer',
    role,
    room,
    shareUrl: stringValue(record?.shareUrl) ?? '',
  }
}

function parseRoom(value: unknown): YunlefunCloudRoom | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const id = stringValue(record.id)
  const ownerUserId = stringValue(record.ownerUserId)
  const title = stringValue(record.title)
  const visibility = parseRoomVisibility(record.visibility)
  const mode = parseRoomMode(record.mode)
  if (!id || !ownerUserId || !title || !visibility || !mode)
    return undefined

  return {
    createdAt: timestampValue(record.createdAt) ?? Date.now(),
    driverUserId: stringValue(record.driverUserId),
    headRevision: numberValue(record.headRevision) ?? 0,
    id,
    latestSnapshotRevision: numberValue(record.latestSnapshotRevision) ?? 0,
    mode,
    ownerUserId,
    title,
    updatedAt: timestampValue(record.updatedAt) ?? Date.now(),
    visibility,
  }
}

function parseRoomMember(value: unknown): YunlefunCloudRoomMember | undefined {
  const record = asRecord(value)
  const roomId = stringValue(record?.roomId)
  const userId = stringValue(record?.userId)
  const role = parseRoomRole(record?.role)
  if (!roomId || !userId || !role)
    return undefined

  return {
    displayName: stringValue(record?.displayName),
    lastSeenAt: timestampValue(record?.lastSeenAt) ?? Date.now(),
    online: booleanValue(record?.online) ?? false,
    presence: asRecord(record?.presence),
    role,
    roomId,
    userId,
  }
}

function parseRoomOperation(value: unknown): YunlefunCloudRoomOperation | undefined {
  const record = asRecord(value)
  const baseRevision = numberValue(record?.baseRevision)
  const clientId = stringValue(record?.clientId)
  const clientOpId = stringValue(record?.clientOpId)
  const createdAt = timestampValue(record?.createdAt)
  const payload = asRecord(record?.payload)
  const revision = numberValue(record?.revision)
  const roomId = stringValue(record?.roomId)
  const type = parseRoomOperationType(record?.type)
  const userId = stringValue(record?.userId)
  if (baseRevision === undefined || !clientId || !clientOpId || createdAt === undefined || !payload || revision === undefined || !roomId || !type || !userId)
    return undefined

  return {
    baseRevision,
    clientId,
    clientOpId,
    createdAt,
    payload,
    revision,
    roomId,
    type,
    userId,
  }
}

function parseRoomSnapshotUploadTarget(value: unknown): RoomSnapshotUploadTarget | undefined {
  const record = asRecord(value)
  const fileName = stringValue(record?.fileName)
  const reservationId = stringValue(record?.reservationId)
  const storageKey = stringValue(record?.storageKey)
  return fileName && reservationId && storageKey ? { fileName, reservationId, storageKey } : undefined
}

function parseRoomSnapshotDownload(value: unknown): RoomSnapshotDownload | undefined {
  const record = asRecord(value)
  const text = typeof record?.text === 'string' ? record.text : undefined
  const downloadUrl = stringValue(record?.downloadUrl)
  if (text === undefined && !downloadUrl)
    return undefined

  return {
    downloadUrl,
    maxBytes: numberValue(record?.maxBytes) ?? DEFAULT_ROOM_SNAPSHOT_MAX_BYTES,
    text,
  }
}

async function readSnapshotText(snapshot: RoomSnapshotDownload): Promise<string> {
  if (snapshot.text !== undefined) {
    if (new Blob([snapshot.text]).size > snapshot.maxBytes)
      throw createFailureError('too_large')
    return snapshot.text
  }
  if (!snapshot.downloadUrl)
    throw createFailureError('invalid_snapshot')

  const response = await fetch(snapshot.downloadUrl)
  if (!response.ok)
    throw createFailureError('invalid_snapshot')
  const blob = await response.blob()
  if (blob.size > snapshot.maxBytes)
    throw createFailureError('too_large')
  return blob.text()
}

async function cleanupUploadedFile(app: YunlefunCloudbaseApp | undefined, fileID: string): Promise<void> {
  if (!app?.deleteFile)
    return

  try {
    await app.deleteFile({ fileList: [fileID] })
  }
  catch (error) {
    if (import.meta.dev)
      console.warn('Failed to clean up uploaded room snapshot after failed finalize.', error)
  }
}

function parseProject(text: string): SaierProjectFile | undefined {
  try {
    const parsed: unknown = JSON.parse(text)
    if (isSaierProjectFile(parsed))
      return parsed
  }
  catch {
    return undefined
  }
  return undefined
}

function isSaierProjectFile(value: unknown): value is SaierProjectFile {
  const record = asRecord(value)
  return Boolean(record
    && record.format === SAIER_PROJECT_FORMAT
    && typeof record.width === 'number'
    && typeof record.height === 'number'
    && Array.isArray(record.layers)
    && Array.isArray(record.surfaces))
}

function withResolvedShareUrl(session: YunlefunCloudRoomSession): YunlefunCloudRoomSession {
  return {
    ...session,
    shareUrl: session.shareUrl || createShareUrl(session.room, session.inviteToken),
  }
}

function createShareUrl(room: YunlefunCloudRoom, inviteToken: string | undefined): string {
  const url = new URL(import.meta.client ? window.location.href : 'https://saier.local/')
  url.pathname = '/'
  url.hash = ''
  url.search = ''
  url.searchParams.set('room', room.id)
  if (inviteToken)
    url.searchParams.set('invite', inviteToken)
  return url.toString()
}

function failureResult(reason: YunlefunCloudRoomFailure, error?: unknown): YunlefunCloudRoomResult {
  const message = normalizeYunlefunCloudErrorMessage(error)
  return {
    message: message && !isRoomFailure(message) ? message : undefined,
    ok: false,
    reason,
  }
}

function createFailureError(reason: YunlefunCloudRoomFailure): Error {
  return new Error(reason)
}

function mapRoomError(error: unknown, fallback: YunlefunCloudRoomFailure): YunlefunCloudRoomFailure {
  const message = normalizeYunlefunCloudErrorMessage(error)
  if (message) {
    if (isRoomFailure(message))
      return message
    if (/登录|unauthenticated|not[_\s-]*authenticated|authentication\s+(?:required|failed)|invalid\s+token|login/i.test(message))
      return 'not_authenticated'
    if (/forbidden|permission|unauthorized|无权|权限|not member/i.test(message))
      return 'forbidden'
    if (/revision[_\s-]*conflict|stale/i.test(message))
      return 'revision_conflict'
    if (/not found|room.*missing|房间.*不存在|找不到/i.test(message))
      return 'room_not_found'
    if (/too large|单文件|200\s*MB|209715200/i.test(message))
      return 'too_large'
    if (/snapshot|project|format|invalid/i.test(message))
      return 'invalid_snapshot'
    if (/function|saier-room-api|room-api|backend|cloudbase|callFunction|database/i.test(message))
      return 'backend_unavailable'
  }
  return fallback
}

function parseRoomRole(value: unknown): YunlefunCloudRoomRole | undefined {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? value : undefined
}

function parseRoomVisibility(value: unknown): YunlefunCloudRoomVisibility | undefined {
  return value === 'link' || value === 'private' ? value : undefined
}

function parseRoomMode(value: unknown): YunlefunCloudRoomMode | undefined {
  return value === 'viewer' || value === 'driver' || value === 'multi-editor' ? value : undefined
}

function parseRoomOperationType(value: unknown): YunlefunCloudRoomOperationType | undefined {
  return value === 'document:command'
    || value === 'layer:command'
    || value === 'project:snapshot'
    || value === 'stroke:append'
    || value === 'stroke:commit'
    || value === 'stroke:start'
    ? value
    : undefined
}

function isRoomFailure(value: string): value is YunlefunCloudRoomFailure {
  return value === 'backend_unavailable'
    || value === 'forbidden'
    || value === 'invalid_snapshot'
    || value === 'not_authenticated'
    || value === 'revision_conflict'
    || value === 'room_not_found'
    || value === 'too_large'
}

function isRoomOperation(value: YunlefunCloudRoomOperation | undefined): value is YunlefunCloudRoomOperation {
  return Boolean(value)
}

function canSubmitRoomOperation(
  room: YunlefunCloudRoom,
  role: YunlefunCloudRoomRole,
  userId: string | undefined,
): boolean {
  if (role === 'owner')
    return true
  if (role !== 'editor')
    return false
  if (room.mode === 'multi-editor')
    return true
  if (room.mode === 'driver')
    return room.driverUserId === userId
  return false
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function timestampValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value))
    return value
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric))
      return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 96)
    || 'saier-room'
}

function isRoomMember(member: YunlefunCloudRoomMember | undefined): member is YunlefunCloudRoomMember {
  return Boolean(member)
}
