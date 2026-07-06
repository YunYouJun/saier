import type { SaierProjectFile } from '@saier/core'
import type {
  YunlefunCloudbaseApp,
  YunlefunCloudbaseUploadProgress,
} from './useYunlefunAuth'
import { SAIER_PROJECT_FORMAT } from '@saier/core'
import { computed, readonly } from 'vue'
import { useRuntimeConfig, useState } from '#imports'
import { isSaierProjectStorageFile, normalizeSaierCloudStorageFileKind } from '../utils/cloudFileKind'
import {
  isYunlefunQuotaExceededMessage,
  isYunlefunStorageUnavailableMessage,
  normalizeYunlefunCloudErrorMessage,
} from '../utils/yunlefunCloudErrors'
import { useYunlefunAuth } from './useYunlefunAuth'

export const SAIER_CLOUD_FILE_MAX_BYTES = 200 * 1024 * 1024

const USER_STORAGE_API_FUNCTION_NAME = 'user-storage-api'
const SAIER_APP_ID = 'saier'
const PROJECT_KIND = 'project'

export type YunlefunCloudFileStatus
  = | 'idle'
    | 'loading'
    | 'uploading'
    | 'finalizing'
    | 'downloading'
    | 'deleting'
    | 'renaming'
    | 'error'

export type YunlefunCloudFileFailure
  = | 'database_unavailable'
    | 'download_failed'
    | 'invalid_project'
    | 'not_authenticated'
    | 'quota_exceeded'
    | 'rename_failed'
    | 'reservation_expired'
    | 'storage_unavailable'
    | 'too_large'

export interface YunlefunCloudStorageQuota {
  addonQuotaBytes: number
  availableBytes: number
  baseQuotaBytes: number
  bonusQuotaBytes: number
  isOverQuota: boolean
  membership: {
    expireAt: number | null
    isActive: boolean
    level: string | null
  }
  quotaBytes: number
  reservedBytes: number
  singleFileLimitBytes: number
  updatedAt: number | null
  usedBytes: number
  userId: string
}

export interface YunlefunCloudFile {
  app: 'saier'
  cloudPath: string
  contentType: 'application/json'
  createdAt: number
  fileID: string
  format: typeof SAIER_PROJECT_FORMAT
  id: string
  kind: 'project'
  name: string
  reservationId: string
  size: number
  updatedAt: number
  userId: string
}

export interface YunlefunCloudFileLabels {
  downloadFailed: string
  invalidProject: string
  missingDatabase: string
  missingStorage: string
  notAuthenticated: string
  quotaExceeded: string
  renameFailed: string
  reservationExpired: string
  tooLarge: string
}

export interface YunlefunCloudFileResult {
  file?: YunlefunCloudFile
  message?: string
  ok: boolean
  quota?: YunlefunCloudStorageQuota
  reason?: YunlefunCloudFileFailure
}

export interface YunlefunCloudProjectResult extends YunlefunCloudFileResult {
  project?: SaierProjectFile
}

interface YunlefunCloudRuntimeConfig {
  public: {
    saierCloudFileMaxBytes?: number
  }
}

interface UploadProjectOptions {
  name: string
}

interface ReserveStorageUploadResult {
  deduped?: boolean
  file: StorageFileSummary
  quota: YunlefunCloudStorageQuota
}

interface FinalizeStorageUploadResult {
  deduped?: boolean
  file: StorageFileSummary
  quota: YunlefunCloudStorageQuota
}

interface DeleteStorageFileResult {
  deduped?: boolean
  file: StorageFileSummary
  quota: YunlefunCloudStorageQuota
}

interface RenameStorageFileResult {
  file: StorageFileSummary
  quota: YunlefunCloudStorageQuota
}

interface DownloadStorageFileResult {
  downloadUrl?: string
  file: StorageFileSummary
  quota: YunlefunCloudStorageQuota
  text?: string
}

interface ListStorageFilesResult {
  items: StorageFileSummary[]
  nextSkip: number | null
}

interface StorageFileSummary {
  appId: string
  contentType: string
  createdAt: number | null
  fileId: string
  fileName: string
  finalizedAt: number | null
  id: string
  kind?: 'brush-library' | 'project'
  reservationId: string
  reservedSizeBytes: number
  sizeBytes: number
  status: string
  storageKey: string
  updatedAt: number | null
  userId: string
}

export function useYunlefunCloudFiles() {
  const config = useRuntimeConfig() as unknown as YunlefunCloudRuntimeConfig
  const {
    account,
    getCloudbaseApp,
    isAuthenticated,
    signIn,
  } = useYunlefunAuth()

  const files = useState<YunlefunCloudFile[]>('yunlefun:cloud-files:files', () => [])
  const quota = useState<YunlefunCloudStorageQuota | null>('yunlefun:cloud-files:quota', () => null)
  const status = useState<YunlefunCloudFileStatus>('yunlefun:cloud-files:status', () => 'idle')
  const lastFailure = useState<YunlefunCloudFileFailure | null>('yunlefun:cloud-files:last-failure', () => null)
  const lastError = useState<string>('yunlefun:cloud-files:last-error', () => '')
  const uploadProgress = useState<number>('yunlefun:cloud-files:upload-progress', () => 0)

  const maxBytes = computed(() => {
    const configured = config.public.saierCloudFileMaxBytes
    const configuredMax = typeof configured === 'number' && Number.isFinite(configured) && configured > 0
      ? Math.round(configured)
      : SAIER_CLOUD_FILE_MAX_BYTES
    return Math.min(configuredMax, quota.value?.singleFileLimitBytes ?? SAIER_CLOUD_FILE_MAX_BYTES, SAIER_CLOUD_FILE_MAX_BYTES)
  })
  const isBusy = computed(() => status.value !== 'idle' && status.value !== 'error')
  const isMember = computed(() => Boolean(quota.value?.membership.isActive))

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

  async function refreshQuota(): Promise<YunlefunCloudStorageQuota | null> {
    if (!await ensureSignedIn())
      return null

    status.value = 'loading'
    lastFailure.value = null
    lastError.value = ''

    try {
      const snapshot = await callUserStorageApi('getStorageQuota', {})
      const parsed = parseQuotaSnapshot(snapshot)
      if (!parsed)
        throw createFailureError('database_unavailable')

      quota.value = parsed
      status.value = 'idle'
      return parsed
    }
    catch (error) {
      setFailure(mapStorageError(error, 'database_unavailable'), error)
      return null
    }
  }

  async function refreshFiles(): Promise<YunlefunCloudFileResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'loading'
    lastFailure.value = null
    lastError.value = ''

    try {
      const [quotaSnapshot, listSnapshot] = await Promise.all([
        callUserStorageApi('getStorageQuota', {}),
        callUserStorageApi('listStorageFiles', { appId: SAIER_APP_ID, kind: PROJECT_KIND, limit: 100 }),
      ])
      const parsedQuota = parseQuotaSnapshot(quotaSnapshot)
      const parsedList = parseListStorageFilesResult(listSnapshot)
      if (!parsedQuota || !parsedList)
        throw createFailureError('database_unavailable')

      quota.value = parsedQuota
      files.value = parsedList.items
        .map(file => parseCloudFileRecord(file, account.value!.uid, maxBytes.value))
        .filter(isCloudFile)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      status.value = 'idle'
      return { ok: true, quota: parsedQuota }
    }
    catch (error) {
      files.value = []
      const reason = mapStorageError(error, 'database_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function uploadProject(project: SaierProjectFile, options: UploadProjectOptions): Promise<YunlefunCloudFileResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    const payload = JSON.stringify(project)
    const blob = new Blob([payload], { type: 'application/json' })
    if (blob.size > maxBytes.value) {
      setFailure('too_large')
      return failureResult('too_large')
    }
    if (quota.value && blob.size > quota.value.availableBytes) {
      setFailure('quota_exceeded')
      return failureResult('quota_exceeded')
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

      const fileName = `${safeFileName(options.name)}.saier.project.json`
      const reserved = parseReserveStorageUploadResult(await callUserStorageApi('reserveStorageUpload', {
        appId: SAIER_APP_ID,
        contentType: 'application/json',
        fileName,
        kind: PROJECT_KIND,
        sizeBytes: blob.size,
      }))
      if (!reserved)
        throw createFailureError('database_unavailable')
      quota.value = reserved.quota

      const file = new File([blob], fileName, { type: 'application/json' })
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

      quota.value = finalized.quota
      const cloudFile = parseCloudFileRecord(finalized.file, account.value!.uid, maxBytes.value)
      if (!cloudFile)
        throw createFailureError('database_unavailable')

      files.value = [cloudFile, ...files.value.filter(item => item.id !== cloudFile.id)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
      uploadProgress.value = 1
      status.value = 'idle'
      return { file: cloudFile, ok: true, quota: finalized.quota }
    }
    catch (error) {
      if (uploadedFileID)
        await cleanupUploadedFile(cleanupApp, uploadedFileID)
      const reason = mapStorageError(error, 'storage_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function downloadProject(file: YunlefunCloudFile): Promise<YunlefunCloudProjectResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'downloading'
    lastFailure.value = null
    lastError.value = ''

    try {
      if (!isCurrentAccountFile(file, account.value!.uid))
        throw createFailureError('download_failed')

      const downloaded = parseDownloadStorageFileResult(await callUserStorageApi('downloadStorageFile', {
        maxBytes: maxBytes.value,
        reservationId: file.reservationId,
      }))
      if (!downloaded)
        throw createFailureError('database_unavailable')
      quota.value = downloaded.quota

      const text = await readDownloadedStorageText(downloaded, maxBytes.value)

      const project = parseProject(text)
      if (!project)
        throw createFailureError('invalid_project')

      status.value = 'idle'
      return { file, ok: true, project, quota: quota.value ?? undefined }
    }
    catch (error) {
      const reason = mapStorageError(error, 'download_failed')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function removeFile(file: YunlefunCloudFile): Promise<YunlefunCloudFileResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'deleting'
    lastFailure.value = null
    lastError.value = ''

    try {
      if (!isCurrentAccountFile(file, account.value!.uid))
        throw createFailureError('database_unavailable')

      const deleted = parseDeleteStorageFileResult(await callUserStorageApi('deleteStorageFile', {
        reservationId: file.reservationId,
      }))
      if (!deleted)
        throw createFailureError('database_unavailable')

      quota.value = deleted.quota
      files.value = files.value.filter(item => item.id !== file.id)
      status.value = 'idle'
      return { file, ok: true, quota: deleted.quota }
    }
    catch (error) {
      const reason = mapStorageError(error, 'database_unavailable')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  async function renameFile(file: YunlefunCloudFile, name: string): Promise<YunlefunCloudFileResult> {
    if (!await ensureSignedIn())
      return failureResult('not_authenticated')

    status.value = 'renaming'
    lastFailure.value = null
    lastError.value = ''

    try {
      if (!isCurrentAccountFile(file, account.value!.uid))
        throw createFailureError('rename_failed')

      const fileName = `${safeFileName(name)}.saier.project.json`
      const renamed = parseRenameStorageFileResult(await callUserStorageApi('renameStorageFile', {
        appId: SAIER_APP_ID,
        fileName,
        kind: PROJECT_KIND,
        reservationId: file.reservationId,
      }))
      if (!renamed)
        throw createFailureError('rename_failed')

      quota.value = renamed.quota
      const cloudFile = parseCloudFileRecord(renamed.file, account.value!.uid, maxBytes.value)
      if (!cloudFile)
        throw createFailureError('rename_failed')

      files.value = files.value
        .map(item => item.id === cloudFile.id ? cloudFile : item)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      status.value = 'idle'
      return { file: cloudFile, ok: true, quota: renamed.quota }
    }
    catch (error) {
      const reason = mapStorageError(error, 'rename_failed')
      setFailure(reason, error)
      return failureResult(reason, error)
    }
  }

  function failureMessage(labels: YunlefunCloudFileLabels): string {
    if (lastError.value)
      return lastError.value
    if (!lastFailure.value)
      return ''

    switch (lastFailure.value) {
      case 'database_unavailable':
        return labels.missingDatabase
      case 'download_failed':
        return labels.downloadFailed
      case 'invalid_project':
        return labels.invalidProject
      case 'not_authenticated':
        return labels.notAuthenticated
      case 'quota_exceeded':
        return labels.quotaExceeded
      case 'rename_failed':
        return labels.renameFailed
      case 'reservation_expired':
        return labels.reservationExpired
      case 'storage_unavailable':
        return labels.missingStorage
      case 'too_large':
        return labels.tooLarge
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

  function setFailure(reason: YunlefunCloudFileFailure, error?: unknown): void {
    lastFailure.value = reason
    const message = normalizeYunlefunCloudErrorMessage(error)
    lastError.value = message && !isCloudFailure(message) && reason === 'database_unavailable'
      ? message
      : ''
    status.value = 'error'
  }

  return {
    downloadProject,
    failureMessage,
    files: readonly(files),
    isBusy,
    isMember,
    maxBytes,
    quota: readonly(quota),
    refreshFiles,
    refreshQuota,
    removeFile,
    renameFile,
    status: readonly(status),
    uploadProgress: readonly(uploadProgress),
    uploadProject,
  }
}

function parseReserveStorageUploadResult(value: unknown): ReserveStorageUploadResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseStorageFileSummary(record?.file)
  return quota && file ? { deduped: booleanValue(record?.deduped), file, quota } : undefined
}

function parseFinalizeStorageUploadResult(value: unknown): FinalizeStorageUploadResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseStorageFileSummary(record?.file)
  return quota && file ? { deduped: booleanValue(record?.deduped), file, quota } : undefined
}

function parseDeleteStorageFileResult(value: unknown): DeleteStorageFileResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseStorageFileSummary(record?.file)
  return quota && file ? { deduped: booleanValue(record?.deduped), file, quota } : undefined
}

function parseRenameStorageFileResult(value: unknown): RenameStorageFileResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseStorageFileSummary(record?.file)
  return quota && file ? { file, quota } : undefined
}

function parseDownloadStorageFileResult(value: unknown): DownloadStorageFileResult | undefined {
  const record = asRecord(value)
  const quota = parseQuotaSnapshot(record?.quota)
  const file = parseStorageFileSummary(record?.file)
  const downloadUrl = stringValue(record?.downloadUrl)
  const text = typeof record?.text === 'string' ? record.text : undefined
  if (!quota || !file || (text === undefined && !downloadUrl))
    return undefined
  return { downloadUrl, file, quota, text }
}

function parseListStorageFilesResult(value: unknown): ListStorageFilesResult | undefined {
  const record = asRecord(value)
  const items = arrayValue(record?.items)
    ?.map(parseStorageFileSummary)
    .filter(isStorageFileSummary)
  const nextSkip = record?.nextSkip === null ? null : numberValue(record?.nextSkip)
  return items ? { items, nextSkip: nextSkip ?? null } : undefined
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

function parseStorageFileSummary(value: unknown): StorageFileSummary | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const appId = stringValue(record.appId)
  const contentType = stringValue(record.contentType) ?? ''
  const fileId = stringValue(record.fileId) ?? ''
  const fileName = stringValue(record.fileName) ?? ''
  const id = stringValue(record.id)
  const rawKind = stringValue(record.kind)
  const kind = normalizeSaierCloudStorageFileKind(rawKind, fileName)
  const reservationId = stringValue(record.reservationId)
  const reservedSizeBytes = numberValue(record.reservedSizeBytes) ?? 0
  const sizeBytes = numberValue(record.sizeBytes) ?? 0
  const status = stringValue(record.status)
  const storageKey = stringValue(record.storageKey)
  const userId = stringValue(record.userId)

  if (!appId || !id || !reservationId || !status || !storageKey || !userId)
    return undefined

  return {
    appId,
    contentType,
    createdAt: timestampValue(record.createdAt) ?? null,
    fileId,
    fileName,
    finalizedAt: timestampValue(record.finalizedAt) ?? null,
    id,
    kind,
    reservationId,
    reservedSizeBytes,
    sizeBytes,
    status,
    storageKey,
    updatedAt: timestampValue(record.updatedAt) ?? null,
    userId,
  }
}

function parseCloudFileRecord(value: unknown, expectedUserId: string, maxBytes: number): YunlefunCloudFile | undefined {
  const record = parseStorageFileSummary(value)
  if (!record)
    return undefined

  const createdAt = record.createdAt ?? record.updatedAt ?? record.finalizedAt
  const updatedAt = record.updatedAt ?? record.finalizedAt ?? record.createdAt
  const projectKind = isSaierProjectStorageFile(record.kind)

  if (record.appId !== SAIER_APP_ID
    || !projectKind
    || record.status !== 'active'
    || record.userId !== expectedUserId
    || record.sizeBytes < 0
    || record.sizeBytes > maxBytes
    || !record.fileId
    || !createdAt
    || !updatedAt) {
    return undefined
  }

  return {
    app: 'saier',
    cloudPath: record.storageKey,
    contentType: 'application/json',
    createdAt,
    fileID: record.fileId,
    format: SAIER_PROJECT_FORMAT,
    id: record.id,
    kind: 'project',
    name: displayProjectName(record.fileName || record.id),
    reservationId: record.reservationId,
    size: record.sizeBytes,
    updatedAt,
    userId: record.userId,
  }
}

function isCloudFile(file: YunlefunCloudFile | undefined): file is YunlefunCloudFile {
  return Boolean(file)
}

function isStorageFileSummary(file: StorageFileSummary | undefined): file is StorageFileSummary {
  return Boolean(file)
}

function isCurrentAccountFile(file: YunlefunCloudFile, userId: string): boolean {
  return file.app === 'saier'
    && file.contentType === 'application/json'
    && file.format === SAIER_PROJECT_FORMAT
    && file.userId === userId
    && file.size >= 0
    && file.size <= SAIER_CLOUD_FILE_MAX_BYTES
    && Boolean(file.reservationId)
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

  const text = await blob.text()
  if (new Blob([text]).size > maxBytes)
    throw createFailureError('too_large')
  return text
}

async function cleanupUploadedFile(app: YunlefunCloudbaseApp | undefined, fileID: string): Promise<void> {
  if (!app?.deleteFile)
    return

  try {
    await app.deleteFile({ fileList: [fileID] })
  }
  catch (error) {
    if (import.meta.dev)
      console.warn('Failed to clean up uploaded cloud file after failed finalize.', error)
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

function failureResult(reason: YunlefunCloudFileFailure, error?: unknown): YunlefunCloudFileResult {
  const message = normalizeYunlefunCloudErrorMessage(error)
  return {
    message: message && !isCloudFailure(message) ? message : undefined,
    ok: false,
    quota: undefined,
    reason,
  }
}

function createFailureError(reason: YunlefunCloudFileFailure): Error {
  return new Error(reason)
}

function mapStorageError(error: unknown, fallback: YunlefunCloudFileFailure): YunlefunCloudFileFailure {
  const message = normalizeYunlefunCloudErrorMessage(error)
  if (message) {
    if (isCloudFailure(message))
      return message
    if (isYunlefunQuotaExceededMessage(message))
      return 'quota_exceeded'
    if (/单文件|200\s*MB|209715200|too large/i.test(message))
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

function isCloudFailure(value: string): value is YunlefunCloudFileFailure {
  return value === 'database_unavailable'
    || value === 'download_failed'
    || value === 'invalid_project'
    || value === 'not_authenticated'
    || value === 'quota_exceeded'
    || value === 'rename_failed'
    || value === 'reservation_expired'
    || value === 'storage_unavailable'
    || value === 'too_large'
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 96)
    || 'saier-project'
}

function displayProjectName(fileName: string): string {
  const name = fileName.replace(/\.saier\.project\.json$/i, '')
  return name || 'saier-project'
}
