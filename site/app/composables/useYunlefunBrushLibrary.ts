import type { BrushPreset } from '@saier/core'
import type { Painter } from 'saier'
import type {
  YunlefunCloudbaseApp,
  YunlefunCloudbaseUploadProgress,
} from './useYunlefunAuth'
import type { YunlefunCloudStorageQuota } from './useYunlefunCloudFiles'
import { computed, readonly } from 'vue'
import { useState } from '#imports'
import {
  createBrushLibraryFile,
  mergeBrushPresets,
  parseBrushLibraryText,
  SAIER_BRUSH_LIBRARY_FILE_NAME,
  SAIER_BRUSH_LIBRARY_MAX_BYTES,
  sameBrushPresetList,
  serializeBrushLibraryFile,
} from '../utils/brushLibrary'
import {
  isYunlefunQuotaExceededMessage,
  isYunlefunStorageUnavailableMessage,
  normalizeYunlefunCloudErrorMessage,
} from '../utils/yunlefunCloudErrors'
import { useYunlefunAuth } from './useYunlefunAuth'

const USER_STORAGE_API_FUNCTION_NAME = 'user-storage-api'
const SAIER_APP_ID = 'saier'
const BRUSH_LIBRARY_KIND = 'brush-library'
const BRUSH_LIBRARY_SLOT_KEY = 'default'
const LOCAL_BRUSH_LIBRARY_KEY = 'saier:brush-library:local'
const SAVE_DEBOUNCE_MS = 800

export type YunlefunBrushLibraryStatus
  = | 'idle'
    | 'loading'
    | 'uploading'
    | 'finalizing'
    | 'downloading'
    | 'error'

export type YunlefunBrushLibraryFailure
  = | 'database_unavailable'
    | 'download_failed'
    | 'invalid_library'
    | 'not_authenticated'
    | 'quota_exceeded'
    | 'reservation_expired'
    | 'storage_unavailable'
    | 'too_large'

export interface YunlefunBrushLibraryLabels {
  downloadFailed: string
  invalidLibrary: string
  missingDatabase: string
  missingStorage: string
  notAuthenticated: string
  quotaExceeded: string
  reservationExpired: string
  tooLarge: string
}

export interface YunlefunBrushLibraryResult {
  message?: string
  ok: boolean
  quota?: YunlefunCloudStorageQuota
  reason?: YunlefunBrushLibraryFailure
}

interface BrushLibraryFileSummary {
  appId: string
  contentType: string
  createdAt: number | null
  fileId: string
  fileName: string
  finalizedAt: number | null
  id: string
  kind: typeof BRUSH_LIBRARY_KIND
  reservationId: string
  sizeBytes: number
  slotKey: typeof BRUSH_LIBRARY_SLOT_KEY
  status: string
  storageKey: string
  updatedAt: number | null
  userId: string
}

interface ListStorageFilesResult {
  items: BrushLibraryFileSummary[]
  nextSkip: number | null
  quota?: YunlefunCloudStorageQuota
}

interface ReserveStorageUploadResult {
  file: BrushLibraryFileSummary
  quota: YunlefunCloudStorageQuota
}

interface FinalizeStorageUploadResult {
  file: BrushLibraryFileSummary
  quota: YunlefunCloudStorageQuota
}

interface DownloadStorageFileResult {
  downloadUrl?: string
  file: BrushLibraryFileSummary
  quota: YunlefunCloudStorageQuota
  text?: string
}

export function useYunlefunBrushLibrary() {
  const {
    account,
    getCloudbaseApp,
    isAuthenticated,
    signIn,
  } = useYunlefunAuth()

  const status = useState<YunlefunBrushLibraryStatus>('yunlefun:brush-library:status', () => 'idle')
  const brushCount = useState<number>('yunlefun:brush-library:count', () => 0)
  const lastSyncedAt = useState<number | null>('yunlefun:brush-library:last-synced-at', () => null)
  const lastFailure = useState<YunlefunBrushLibraryFailure | null>('yunlefun:brush-library:last-failure', () => null)
  const lastError = useState<string>('yunlefun:brush-library:last-error', () => '')
  const uploadProgress = useState<number>('yunlefun:brush-library:upload-progress', () => 0)

  const isBusy = computed(() => status.value !== 'idle' && status.value !== 'error')
  let currentPainter: Painter | undefined
  let removeBrushListener: (() => void) | undefined
  let applyingRemote = false
  let initialized = false
  let lastKnownPresets: BrushPreset[] = []
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  function bindPainter(painter: Painter | undefined): void {
    removeBrushListener?.()
    removeBrushListener = undefined
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = undefined
    }
    currentPainter = painter
    initialized = false
    lastKnownPresets = []

    if (!painter) {
      brushCount.value = 0
      return
    }

    const handleBrushChange = () => {
      if (!applyingRemote && initialized)
        scheduleSave(painter)
    }
    painter.controller.on('brush:change', handleBrushChange)
    removeBrushListener = () => {
      painter.controller.off('brush:change', handleBrushChange)
    }
  }

  function loadLocal(painter = currentPainter): YunlefunBrushLibraryResult {
    if (!painter)
      return { ok: true }

    const localLibrary = readLocalLibrary(account.value?.uid) ?? readLocalLibrary()
    if (localLibrary?.presets.length) {
      applyingRemote = true
      try {
        applyPresets(painter, localLibrary.presets)
      }
      finally {
        applyingRemote = false
      }
      brushCount.value = localLibrary.presets.length
      lastSyncedAt.value = localLibrary.updatedAt
    }
    else {
      brushCount.value = syncablePresets(painter).length
    }
    lastKnownPresets = syncablePresets(painter)
    initialized = true
    return { ok: true }
  }

  async function syncFromCloud(painter = currentPainter): Promise<YunlefunBrushLibraryResult> {
    if (!painter)
      return { ok: true }
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'loading'
    lastFailure.value = null
    lastError.value = ''

    try {
      const cloud = await downloadCloudBrushLibrary()
      const local = [
        ...(readLocalLibrary(account.value?.uid)?.presets ?? []),
        ...(readLocalLibrary()?.presets ?? []),
        ...syncablePresets(painter),
      ]
      const merged = mergeBrushPresets(cloud.presets, local)
      applyingRemote = true
      try {
        applyPresets(painter, merged.presets)
      }
      finally {
        applyingRemote = false
      }

      const nextLibrary = createBrushLibraryFile(merged.presets)
      writeLocalLibrary(nextLibrary, account.value?.uid)
      removeLocalLibrary()
      brushCount.value = nextLibrary.presets.length
      lastSyncedAt.value = nextLibrary.updatedAt
      lastKnownPresets = syncablePresets(painter)
      initialized = true

      if (merged.changed || (cloud.missing && nextLibrary.presets.length > 0))
        return uploadBrushLibrary(nextLibrary)

      status.value = 'idle'
      return { ok: true, quota: cloud.quota }
    }
    catch (error) {
      loadLocal(painter)
      const reason = mapBrushLibraryError(error, 'database_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  function scheduleSave(painter = currentPainter): void {
    if (!painter)
      return
    if (saveTimer)
      clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void saveNow(painter)
    }, SAVE_DEBOUNCE_MS)
  }

  async function saveNow(painter = currentPainter): Promise<YunlefunBrushLibraryResult> {
    if (!painter)
      return { ok: true }

    const presets = syncablePresets(painter)
    if (sameBrushPresetList(presets, lastKnownPresets)) {
      brushCount.value = presets.length
      status.value = 'idle'
      return { ok: true }
    }

    const library = createBrushLibraryFile(presets)
    writeLocalLibrary(library, account.value?.uid)
    brushCount.value = library.presets.length
    lastSyncedAt.value = library.updatedAt
    lastKnownPresets = library.presets.map(preset => ({ ...preset }))

    if (!isAuthenticated.value) {
      status.value = 'idle'
      return { ok: true }
    }

    return uploadBrushLibrary(library)
  }

  function failureMessage(labels: YunlefunBrushLibraryLabels): string {
    if (lastError.value)
      return lastError.value
    if (!lastFailure.value)
      return ''

    switch (lastFailure.value) {
      case 'database_unavailable':
        return labels.missingDatabase
      case 'download_failed':
        return labels.downloadFailed
      case 'invalid_library':
        return labels.invalidLibrary
      case 'not_authenticated':
        return labels.notAuthenticated
      case 'quota_exceeded':
        return labels.quotaExceeded
      case 'reservation_expired':
        return labels.reservationExpired
      case 'storage_unavailable':
        return labels.missingStorage
      case 'too_large':
        return labels.tooLarge
    }
  }

  async function ensureSignedIn(): Promise<boolean> {
    if (isAuthenticated.value)
      return true

    const ok = await signIn('interactive')
    if (!ok)
      setFailure('not_authenticated')
    return ok
  }

  async function downloadCloudBrushLibrary(): Promise<{
    missing: boolean
    presets: BrushPreset[]
    quota?: YunlefunCloudStorageQuota
    updatedAt: number
  }> {
    const listResult = parseListStorageFilesResult(await callUserStorageApi('listStorageFiles', {
      appId: SAIER_APP_ID,
      kind: BRUSH_LIBRARY_KIND,
      limit: 1,
      slotKey: BRUSH_LIBRARY_SLOT_KEY,
    }))
    if (!listResult)
      throw createFailureError('database_unavailable')
    const file = listResult.items
      .filter(item => item.status === 'active')
      .sort(compareBrushLibraryFiles)[0]
    if (!file) {
      return {
        missing: true,
        presets: [],
        quota: listResult.quota,
        updatedAt: 0,
      }
    }
    if (!file.fileId)
      throw createFailureError('download_failed')

    status.value = 'downloading'
    const downloaded = parseDownloadStorageFileResult(await callUserStorageApi('downloadStorageFile', {
      maxBytes: SAIER_BRUSH_LIBRARY_MAX_BYTES,
      reservationId: file.reservationId,
    }))
    if (!downloaded)
      throw createFailureError('database_unavailable')

    const text = await readDownloadedStorageText(downloaded, SAIER_BRUSH_LIBRARY_MAX_BYTES)
    const library = parseBrushLibraryText(text)
    if (!library)
      throw createFailureError('invalid_library')

    return {
      missing: false,
      presets: library.presets,
      quota: downloaded.quota ?? listResult.quota,
      updatedAt: library.updatedAt,
    }
  }

  async function uploadBrushLibrary(library: ReturnType<typeof createBrushLibraryFile>): Promise<YunlefunBrushLibraryResult> {
    let payload: string
    try {
      payload = serializeBrushLibraryFile(library)
    }
    catch {
      setFailure('too_large')
      return failureResult('too_large')
    }
    const blob = new Blob([payload], { type: 'application/json' })
    if (blob.size > SAIER_BRUSH_LIBRARY_MAX_BYTES) {
      setFailure('too_large')
      return failureResult('too_large')
    }

    status.value = 'uploading'
    uploadProgress.value = 0
    lastFailure.value = null
    lastError.value = ''

    let cleanupApp: YunlefunCloudbaseApp | undefined
    let uploadedFileID: string | undefined

    try {
      const app = await ensureCloudbaseApp()
      cleanupApp = app
      if (!app.uploadFile)
        throw createFailureError('storage_unavailable')

      const reserved = parseReserveStorageUploadResult(await callUserStorageApi('reserveStorageUpload', {
        appId: SAIER_APP_ID,
        contentType: 'application/json',
        fileName: SAIER_BRUSH_LIBRARY_FILE_NAME,
        kind: BRUSH_LIBRARY_KIND,
        sizeBytes: blob.size,
        slotKey: BRUSH_LIBRARY_SLOT_KEY,
      }))
      if (!reserved)
        throw createFailureError('database_unavailable')

      const file = new File([blob], SAIER_BRUSH_LIBRARY_FILE_NAME, { type: 'application/json' })
      const upload = await app.uploadFile({
        cloudPath: reserved.file.storageKey,
        filePath: file,
        onUploadProgress(progress: YunlefunCloudbaseUploadProgress) {
          if (progress.total && progress.total > 0)
            uploadProgress.value = Math.max(0, Math.min(1, progress.loaded / progress.total))
        },
      })
      if (!upload.fileID)
        throw createFailureError('storage_unavailable')
      uploadedFileID = upload.fileID

      status.value = 'finalizing'
      const finalized = parseFinalizeStorageUploadResult(await callUserStorageApi('finalizeStorageUpload', {
        fileId: upload.fileID,
        reservationId: reserved.file.reservationId,
        storageKey: reserved.file.storageKey,
      }))
      if (!finalized)
        throw createFailureError('database_unavailable')

      uploadProgress.value = 1
      status.value = 'idle'
      return { ok: true, quota: finalized.quota }
    }
    catch (error) {
      if (uploadedFileID)
        await cleanupUploadedFile(cleanupApp, uploadedFileID)
      const reason = mapBrushLibraryError(error, 'storage_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function ensureCloudbaseApp(): Promise<YunlefunCloudbaseApp> {
    const app = await getCloudbaseApp()
    if (!app)
      throw createFailureError('storage_unavailable')
    return app
  }

  async function callUserStorageApi(action: string, data: Record<string, unknown>): Promise<unknown> {
    const app = await ensureCloudbaseApp()
    if (!app.callFunction)
      throw createFailureError('database_unavailable')

    const response = await app.callFunction({
      name: USER_STORAGE_API_FUNCTION_NAME,
      data: { action, ...data },
    })
    if (response.result === undefined)
      throw createFailureError('database_unavailable')
    return response.result
  }

  function setFailure(reason: YunlefunBrushLibraryFailure, error?: unknown): void {
    lastFailure.value = reason
    const message = normalizeYunlefunCloudErrorMessage(error)
    lastError.value = message && !isBrushLibraryFailure(message) && reason === 'database_unavailable'
      ? message
      : ''
    status.value = 'error'
  }

  return {
    bindPainter,
    brushCount: readonly(brushCount),
    failureMessage,
    isBusy,
    lastSyncedAt: readonly(lastSyncedAt),
    loadLocal,
    saveNow,
    scheduleSave,
    status: readonly(status),
    syncFromCloud,
    uploadProgress: readonly(uploadProgress),
  }
}

function syncablePresets(painter: Painter): BrushPreset[] {
  return createBrushLibraryFile(painter.brush.listPresets()).presets
}

function applyPresets(painter: Painter, presets: readonly BrushPreset[]): void {
  for (const preset of presets)
    painter.brush.registerPreset(preset, { select: false })
}

function readLocalLibrary(userId?: string): ReturnType<typeof parseBrushLibraryText> {
  if (!import.meta.client)
    return undefined

  const text = localStorage.getItem(localStorageKey(userId))
  return text ? parseBrushLibraryText(text) : undefined
}

function writeLocalLibrary(library: ReturnType<typeof createBrushLibraryFile>, userId?: string): void {
  if (!import.meta.client)
    return

  localStorage.setItem(localStorageKey(userId), serializeBrushLibraryFile(library))
}

function removeLocalLibrary(userId?: string): void {
  if (!import.meta.client)
    return

  localStorage.removeItem(localStorageKey(userId))
}

function localStorageKey(userId?: string): string {
  return userId ? `saier:brush-library:${userId}` : LOCAL_BRUSH_LIBRARY_KEY
}

function parseListStorageFilesResult(value: unknown): ListStorageFilesResult | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined
  const items = arrayValue(record.items)
    ?.map(parseBrushLibraryFileSummary)
    .filter(isBrushLibraryFileSummary)
  const nextSkip = record.nextSkip === null ? null : numberValue(record.nextSkip)
  if (!items)
    return undefined
  return {
    items,
    nextSkip: nextSkip ?? null,
    quota: parseQuotaSnapshot(record.quota),
  }
}

function parseReserveStorageUploadResult(value: unknown): ReserveStorageUploadResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseBrushLibraryFileSummary(record?.file)
  return quota && file ? { file, quota } : undefined
}

function parseFinalizeStorageUploadResult(value: unknown): FinalizeStorageUploadResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseBrushLibraryFileSummary(record?.file)
  return quota && file ? { file, quota } : undefined
}

function parseDownloadStorageFileResult(value: unknown): DownloadStorageFileResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseBrushLibraryFileSummary(record?.file)
  const downloadUrl = stringValue(record?.downloadUrl)
  const text = typeof record?.text === 'string' ? record.text : undefined
  if (!quota || !file || (text === undefined && !downloadUrl))
    return undefined
  return { downloadUrl, file, quota, text }
}

function parseBrushLibraryFileSummary(value: unknown): BrushLibraryFileSummary | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const appId = stringValue(record.appId)
  const contentType = stringValue(record.contentType) ?? ''
  const fileId = stringValue(record.fileId) ?? stringValue(record.fileID) ?? ''
  const fileName = stringValue(record.fileName) ?? ''
  const id = stringValue(record.id)
  const kind = stringValue(record.kind)
  const reservationId = stringValue(record.reservationId)
  const sizeBytes = numberValue(record.sizeBytes) ?? 0
  const slotKey = stringValue(record.slotKey)
  const status = stringValue(record.status)
  const storageKey = stringValue(record.storageKey)
  const userId = stringValue(record.userId)

  if (!appId || appId !== SAIER_APP_ID || !id || !reservationId || !status || !storageKey || !userId)
    return undefined
  if (kind !== BRUSH_LIBRARY_KIND || slotKey !== BRUSH_LIBRARY_SLOT_KEY)
    return undefined
  if (fileName !== SAIER_BRUSH_LIBRARY_FILE_NAME || contentType !== 'application/json')
    return undefined
  if (sizeBytes > SAIER_BRUSH_LIBRARY_MAX_BYTES)
    return undefined

  return {
    appId,
    contentType,
    createdAt: timestampValue(record.createdAt) ?? null,
    fileId,
    fileName,
    finalizedAt: timestampValue(record.finalizedAt) ?? null,
    id,
    kind: BRUSH_LIBRARY_KIND,
    reservationId,
    sizeBytes,
    slotKey: BRUSH_LIBRARY_SLOT_KEY,
    status,
    storageKey,
    updatedAt: timestampValue(record.updatedAt) ?? null,
    userId,
  }
}

function isBrushLibraryFileSummary(file: BrushLibraryFileSummary | undefined): file is BrushLibraryFileSummary {
  return Boolean(file)
}

function compareBrushLibraryFiles(a: BrushLibraryFileSummary, b: BrushLibraryFileSummary): number {
  return brushLibraryFileTime(b) - brushLibraryFileTime(a)
}

function brushLibraryFileTime(file: BrushLibraryFileSummary): number {
  return file.updatedAt ?? file.finalizedAt ?? file.createdAt ?? 0
}

function parseQuotaSnapshot(value: unknown): YunlefunCloudStorageQuota | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const quotaBytes = numberValue(record.quotaBytes)
  const baseQuotaBytes = numberValue(record.baseQuotaBytes)
  const addonQuotaBytes = numberValue(record.addonQuotaBytes)
  const bonusQuotaBytes = numberValue(record.bonusQuotaBytes)
  const usedBytes = numberValue(record.usedBytes)
  const reservedBytes = numberValue(record.reservedBytes)
  const availableBytes = numberValue(record.availableBytes)
  const singleFileLimitBytes = numberValue(record.singleFileLimitBytes)
  const membership = asRecord(record.membership)
  const userId = stringValue(record.userId) ?? ''

  if (quotaBytes === undefined
    || baseQuotaBytes === undefined
    || addonQuotaBytes === undefined
    || bonusQuotaBytes === undefined
    || usedBytes === undefined
    || reservedBytes === undefined
    || availableBytes === undefined
    || singleFileLimitBytes === undefined
    || !membership) {
    return undefined
  }

  return {
    addonQuotaBytes,
    availableBytes,
    baseQuotaBytes,
    bonusQuotaBytes,
    isOverQuota: booleanValue(record.isOverQuota) ?? false,
    membership: {
      expireAt: timestampValue(membership.expireAt) ?? null,
      isActive: booleanValue(membership.isActive) ?? false,
      level: stringValue(membership.level) ?? null,
    },
    quotaBytes,
    reservedBytes,
    singleFileLimitBytes,
    updatedAt: timestampValue(record.updatedAt) ?? null,
    usedBytes,
    userId,
  }
}

async function readDownloadedStorageText(result: DownloadStorageFileResult, maxBytes: number): Promise<string> {
  if (result.text !== undefined) {
    if (new Blob([result.text]).size > maxBytes)
      throw createFailureError('too_large')
    return result.text
  }
  if (!result.downloadUrl)
    throw createFailureError('download_failed')

  const response = await fetch(result.downloadUrl)
  if (!response.ok)
    throw createFailureError('download_failed')
  const blob = await response.blob()
  if (blob.size > maxBytes)
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
      console.warn('Failed to clean up uploaded brush library after failed finalize.', error)
  }
}

function failureResult(reason: YunlefunBrushLibraryFailure, error?: unknown): YunlefunBrushLibraryResult {
  const message = normalizeYunlefunCloudErrorMessage(error)
  return {
    message: message && !isBrushLibraryFailure(message) ? message : undefined,
    ok: false,
    quota: undefined,
    reason,
  }
}

function createFailureError(reason: YunlefunBrushLibraryFailure): Error {
  return new Error(reason)
}

function mapBrushLibraryError(error: unknown, fallback: YunlefunBrushLibraryFailure): YunlefunBrushLibraryFailure {
  const message = normalizeYunlefunCloudErrorMessage(error)
  if (message) {
    if (isBrushLibraryFailure(message))
      return message
    if (isYunlefunQuotaExceededMessage(message))
      return 'quota_exceeded'
    if (/256\s*KiB|262144|too large/i.test(message))
      return 'too_large'
    if (/过期|expired/i.test(message))
      return 'reservation_expired'
    if (isYunlefunStorageUnavailableMessage(message))
      return 'storage_unavailable'
    if (/登录|unauthenticated|not[_\s-]*authenticated|authentication\s+(?:required|failed)|invalid\s+token|login/i.test(message))
      return 'not_authenticated'
  }
  return fallback
}

function isBrushLibraryFailure(value: string): value is YunlefunBrushLibraryFailure {
  return value === 'database_unavailable'
    || value === 'download_failed'
    || value === 'invalid_library'
    || value === 'not_authenticated'
    || value === 'quota_exceeded'
    || value === 'reservation_expired'
    || value === 'storage_unavailable'
    || value === 'too_large'
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
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : undefined
  }

  const record = asRecord(value)
  const seconds = numberValue(record?.seconds) ?? numberValue(record?._seconds)
  if (seconds !== undefined)
    return seconds * 1000
  return undefined
}
