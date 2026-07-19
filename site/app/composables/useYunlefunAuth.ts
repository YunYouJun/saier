import type { SsoFailureReason, SsoMode } from '@yunlefun/sso'
import type { SsoSetSessionAuth } from '@yunlefun/sso/legacy'
import { computed, readonly } from 'vue'
import { useRuntimeConfig, useState } from '#imports'
import { withYunlefunInteractiveLoginPopup } from '../utils/yunlefunSso'

export type YunlefunAuthStatus = 'idle' | 'checking' | 'signed-in' | 'signed-out' | 'signing-in' | 'error'

export interface YunlefunAccount {
  uid: string
  displayName: string
  email?: string
  avatarUrl?: string
}

interface YunlefunRuntimeConfig {
  public: {
    yunlefunCloudbaseEnv?: string
    yunlefunSsoOrigin?: string
  }
}

interface CloudbaseUser {
  uid?: string
  name?: string
  displayName?: string
  nickName?: string
  username?: string
  email?: string
  avatar?: string
  avatarUrl?: string
  photoURL?: string
  is_anonymous?: boolean
}

interface CloudbaseLoginState {
  user?: CloudbaseUser | null
}

interface YunlefunAuthClient extends SsoSetSessionAuth {
  currentUser?: CloudbaseUser | null
  getLoginState: () => Promise<CloudbaseLoginState | null>
  onLoginStateChanged?: (callback: (state: CloudbaseLoginState | null) => void) => void
  signOut?: () => Promise<unknown>
}

export type YunlefunCloudbaseQueryOrder = 'asc' | 'desc'

export interface YunlefunCloudbaseQuery {
  get: () => Promise<{ data?: unknown[] }>
  limit: (limit: number) => YunlefunCloudbaseQuery
  orderBy: (field: string, order: YunlefunCloudbaseQueryOrder) => YunlefunCloudbaseQuery
  remove: () => Promise<{ deleted?: number }>
  where: (query: Record<string, unknown>) => YunlefunCloudbaseQuery
}

export interface YunlefunCloudbaseDocument {
  get: () => Promise<{ data?: unknown }>
  remove: () => Promise<unknown>
  update: (data: Record<string, unknown>) => Promise<unknown>
}

export interface YunlefunCloudbaseCollection extends YunlefunCloudbaseQuery {
  add: (data: Record<string, unknown>) => Promise<{ id?: string, _id?: string }>
  doc: (id: string) => YunlefunCloudbaseDocument
}

export interface YunlefunCloudbaseDatabase {
  collection: (name: string) => YunlefunCloudbaseCollection
}

export interface YunlefunCloudbaseUploadProgress {
  loaded: number
  total?: number
}

export interface YunlefunCloudbaseFileOperationResult {
  fileList?: Array<{
    code?: string
    fileID?: string
    message?: string
  }>
}

export interface YunlefunCloudbaseStorageDownloadResult {
  data?: Blob | null
  error?: unknown
}

export interface YunlefunCloudbaseStorageFileApi {
  createSignedUrl?: (path: string, expiresIn: number) => Promise<{
    data?: { signedUrl?: string } | null
    error?: unknown
  }>
  download?: (path: string) => Promise<YunlefunCloudbaseStorageDownloadResult>
}

export interface YunlefunCloudbaseStorageClient {
  from?: () => YunlefunCloudbaseStorageFileApi
}

export interface YunlefunCloudbaseFunctionResult<TResult = unknown> {
  result?: TResult
  requestId?: string
}

export interface YunlefunCloudbaseApp {
  auth: (options?: { persistence: 'local' | 'session' | 'none' }) => YunlefunAuthClient
  callFunction?: <TResult = unknown>(params: {
    data?: Record<string, unknown>
    name: string
  }) => Promise<YunlefunCloudbaseFunctionResult<TResult>>
  database?: () => YunlefunCloudbaseDatabase
  deleteFile?: (params: { fileList: string[] }) => Promise<YunlefunCloudbaseFileOperationResult>
  downloadFile?: (params: { fileID: string }) => Promise<{
    code?: string
    fileContent?: unknown
    message?: string
  }>
  getTempFileURL?: (params: { fileList: Array<string | { fileID: string, maxAge: number }> }) => Promise<{
    fileList?: Array<{
      code?: string
      download_url?: string
      downloadUrl?: string
      downloadUrlEncoded?: string
      fileID: string
      message?: string
      tempFileURL?: string
    }>
  }>
  storage?: YunlefunCloudbaseStorageClient
  uploadFile?: (params: {
    cloudPath: string
    filePath: Blob | File
    onUploadProgress?: (progress: YunlefunCloudbaseUploadProgress) => void
  }) => Promise<{ fileID: string, requestId?: string }>
}

interface CloudbaseModule {
  default?: {
    init: (config: { env: string }) => YunlefunCloudbaseApp
  }
  init?: (config: { env: string }) => YunlefunCloudbaseApp
}

let cachedApp: YunlefunCloudbaseApp | undefined
let cachedAuth: YunlefunAuthClient | undefined
let pendingApp: Promise<YunlefunCloudbaseApp | undefined> | undefined
let pendingAuth: Promise<YunlefunAuthClient | undefined> | undefined
let loginStateListenerAttached = false

export function useYunlefunAuth() {
  const config = useRuntimeConfig() as unknown as YunlefunRuntimeConfig
  const account = useState<YunlefunAccount | null>('yunlefun:auth:account', () => null)
  const status = useState<YunlefunAuthStatus>('yunlefun:auth:status', () => 'idle')
  const lastFailure = useState<SsoFailureReason | null>('yunlefun:auth:last-failure', () => null)
  const lastError = useState<string | null>('yunlefun:auth:last-error', () => null)
  const silentAttempted = useState<boolean>('yunlefun:auth:silent-attempted', () => false)
  const inNativeApp = useState<boolean>('yunlefun:auth:in-native-app', () => false)

  const cloudbaseEnv = computed(() => normalizeConfigValue(config.public.yunlefunCloudbaseEnv))
  const ssoOrigin = computed(() => normalizeConfigValue(config.public.yunlefunSsoOrigin))
  const isAuthenticated = computed(() => Boolean(account.value))
  const displayName = computed(() => account.value?.displayName ?? '')
  const errorMessage = computed(() => lastError.value ?? failureMessage(lastFailure.value))

  async function initialize(): Promise<void> {
    const auth = await ensureAuth(cloudbaseEnv.value)
    if (!auth)
      return

    attachLoginStateListener(auth, syncLoginState)
    await refresh()
  }

  async function refresh(): Promise<void> {
    const auth = await ensureAuth(cloudbaseEnv.value)
    if (!auth)
      return

    const state = await getLoginState(auth)
    syncLoginState(state)
  }

  async function signIn(mode: SsoMode = 'interactive'): Promise<boolean> {
    if (!import.meta.client)
      return false

    const auth = await ensureAuth(cloudbaseEnv.value)
    if (!auth)
      return false

    attachLoginStateListener(auth, syncLoginState)
    status.value = mode === 'interactive' ? 'signing-in' : 'checking'
    lastFailure.value = null
    lastError.value = null

    try {
      const { isInYunleApp, signInWithSso } = await import('@yunlefun/sso/legacy')
      inNativeApp.value = isInYunleApp()
      const requestSso = () => signInWithSso(auth, {
        allowHttpLocalhost: import.meta.dev,
        mode,
        ...(ssoOrigin.value ? { ssoOrigin: ssoOrigin.value } : {}),
      })
      const result = mode === 'interactive' && !inNativeApp.value
        ? await withYunlefunInteractiveLoginPopup(ssoOrigin.value, requestSso)
        : await requestSso()

      if (result.ok) {
        await refresh()
        return true
      }

      lastFailure.value = result.reason
      await refresh()
      if (mode === 'interactive' && result.reason !== 'not_authenticated')
        status.value = 'error'
      return false
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = mode === 'interactive' ? 'error' : 'signed-out'
      return false
    }
  }

  async function syncSilently(): Promise<boolean> {
    if (silentAttempted.value || isAuthenticated.value)
      return isAuthenticated.value

    silentAttempted.value = true
    return signIn('silent')
  }

  async function signOut(): Promise<void> {
    const auth = await ensureAuth(cloudbaseEnv.value)
    if (auth?.signOut)
      await auth.signOut()

    account.value = null
    status.value = 'signed-out'
    lastFailure.value = null
    lastError.value = null
    silentAttempted.value = false
  }

  function syncLoginState(state: CloudbaseLoginState | null): void {
    const next = normalizeAccount(state?.user ?? cachedAuth?.currentUser)
    account.value = next
    status.value = next ? 'signed-in' : 'signed-out'
  }

  return {
    account: readonly(account),
    displayName,
    errorMessage,
    getCloudbaseApp: () => ensureCloudbaseApp(cloudbaseEnv.value),
    inNativeApp: readonly(inNativeApp),
    initialize,
    isAuthenticated,
    refresh,
    signIn,
    signOut,
    status: readonly(status),
    syncSilently,
  }
}

async function ensureAuth(env: string): Promise<YunlefunAuthClient | undefined> {
  if (!import.meta.client)
    return undefined
  if (!env)
    throw new Error('Missing NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV.')
  if (cachedAuth)
    return cachedAuth

  pendingAuth ??= createAuth(env)
  cachedAuth = await pendingAuth
  return cachedAuth
}

async function createAuth(env: string): Promise<YunlefunAuthClient> {
  const app = await ensureCloudbaseApp(env)
  if (!app)
    throw new Error('CloudBase is unavailable outside the browser.')

  return app.auth({ persistence: 'local' })
}

async function ensureCloudbaseApp(env: string): Promise<YunlefunCloudbaseApp | undefined> {
  if (!import.meta.client)
    return undefined
  if (!env)
    throw new Error('Missing NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV.')
  if (cachedApp)
    return cachedApp

  pendingApp ??= createCloudbaseApp(env)
  cachedApp = await pendingApp
  return cachedApp
}

async function createCloudbaseApp(env: string): Promise<YunlefunCloudbaseApp> {
  const cloudbaseModule = await import('@cloudbase/js-sdk') as unknown as CloudbaseModule
  const cloudbase = cloudbaseModule.default ?? cloudbaseModule
  if (!cloudbase.init)
    throw new Error('@cloudbase/js-sdk does not expose init().')

  return cloudbase.init({ env })
}

function attachLoginStateListener(
  auth: YunlefunAuthClient,
  syncLoginState: (state: CloudbaseLoginState | null) => void,
): void {
  if (loginStateListenerAttached || !auth.onLoginStateChanged)
    return

  loginStateListenerAttached = true
  auth.onLoginStateChanged((state) => {
    syncLoginState(state)
  })
}

async function getLoginState(auth: YunlefunAuthClient): Promise<CloudbaseLoginState | null> {
  try {
    return await auth.getLoginState()
  }
  catch {
    return null
  }
}

function normalizeAccount(user: CloudbaseUser | null | undefined): YunlefunAccount | null {
  if (!user?.uid || user.is_anonymous)
    return null

  return {
    uid: user.uid,
    displayName: firstNonEmpty([
      user.displayName,
      user.name,
      user.nickName,
      user.username,
      user.email,
      user.uid.slice(0, 8),
    ])!,
    email: firstNonEmpty([user.email]),
    avatarUrl: firstNonEmpty([user.avatarUrl, user.avatar, user.photoURL]),
  }
}

function firstNonEmpty(values: Array<string | undefined>): string | undefined {
  return values.find(value => typeof value === 'string' && value.trim())?.trim()
}

function normalizeConfigValue(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function failureMessage(reason: SsoFailureReason | null): string {
  if (!reason || reason === 'not_authenticated')
    return ''
  return reason
}
