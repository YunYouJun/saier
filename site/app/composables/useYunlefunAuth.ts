import type { SsoAdoptionAuth, SsoFailureReason } from '@yunlefun/sso'
import { computed, readonly } from 'vue'
import { navigateTo, useRuntimeConfig, useState } from '#imports'
import {
  createIdentitySynchronizationCoordinator,
  createLoginStatePublicationGate,
  synchronizeYunlefunIdentity,
} from '../utils/yunlefunIdentity'

export type YunlefunAuthStatus = 'idle' | 'checking' | 'signed-in' | 'signed-out' | 'signing-in' | 'error'
export type YunlefunSsoMode = 'interactive' | 'silent'

export interface YunlefunAccount {
  uid: string
  displayName: string
  email?: string
  avatarUrl?: string
}

interface YunlefunRuntimeConfig {
  public: {
    yunlefunCloudbaseEnv?: string
    yunlefunSsoClientId?: string
    yunlefunSsoExchangeUrl?: string
    yunlefunSsoOrigin?: string
    yunlefunSsoRedirectUri?: string
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

interface YunlefunAuthClient extends SsoAdoptionAuth {
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
let hostIdentityListenerAttached = false
const identitySynchronization = createIdentitySynchronizationCoordinator()
const loginStatePublication = createLoginStatePublicationGate()

export function useYunlefunAuth() {
  const config = useRuntimeConfig() as unknown as YunlefunRuntimeConfig
  const account = useState<YunlefunAccount | null>('yunlefun:auth:account', () => null)
  const status = useState<YunlefunAuthStatus>('yunlefun:auth:status', () => 'idle')
  const lastFailure = useState<SsoFailureReason | null>('yunlefun:auth:last-failure', () => null)
  const lastError = useState<string | null>('yunlefun:auth:last-error', () => null)
  const silentAttempted = useState<boolean>('yunlefun:auth:silent-attempted', () => false)
  const inNativeApp = useState<boolean>('yunlefun:auth:in-native-app', () => false)

  const cloudbaseEnv = computed(() => normalizeConfigValue(config.public.yunlefunCloudbaseEnv))
  const ssoClientId = computed(() => normalizeConfigValue(config.public.yunlefunSsoClientId))
  const ssoExchangeUrl = computed(() => normalizeConfigValue(config.public.yunlefunSsoExchangeUrl))
  const ssoOrigin = computed(() => normalizeConfigValue(config.public.yunlefunSsoOrigin))
  const ssoRedirectUri = computed(() => normalizeConfigValue(config.public.yunlefunSsoRedirectUri))
  const isAuthenticated = computed(() => Boolean(account.value))
  const displayName = computed(() => account.value?.displayName ?? '')
  const errorMessage = computed(() => lastError.value ?? failureMessage(lastFailure.value))

  async function initialize(): Promise<void> {
    const auth = await ensureAuth(cloudbaseEnv.value)
    if (!auth)
      return

    attachLoginStateListener(auth, syncLoginState)
    attachHostIdentityListener(resyncFromHost)
    await refresh()
  }

  async function refresh(): Promise<void> {
    await identitySynchronization.run(async (context) => {
      const auth = await ensureAuth(cloudbaseEnv.value)
      if (!auth)
        return

      await loginStatePublication.run(async () => {
        await refreshCurrentIdentity(auth, context)
      })
    })
  }

  async function signIn(
    mode: YunlefunSsoMode = 'interactive',
    options: { beforeRedirect?: () => Promise<void> | void } = {},
  ): Promise<boolean> {
    return identitySynchronization.run(context => runSignIn(mode, options, context))
  }

  async function runSignIn(
    mode: YunlefunSsoMode,
    options: { beforeRedirect?: () => Promise<void> | void },
    context: { isCurrent: () => boolean },
  ): Promise<boolean> {
    return loginStatePublication.run(() => performSignIn(mode, options, context))
  }

  async function performSignIn(
    mode: YunlefunSsoMode,
    options: { beforeRedirect?: () => Promise<void> | void },
    context: { isCurrent: () => boolean },
  ): Promise<boolean> {
    if (!import.meta.client)
      return false

    const auth = await ensureAuth(cloudbaseEnv.value)
    if (!auth)
      return false

    attachLoginStateListener(auth, syncLoginState)
    attachHostIdentityListener(resyncFromHost)
    status.value = mode === 'interactive' ? 'signing-in' : 'checking'
    lastFailure.value = null
    lastError.value = null

    try {
      const result = await synchronizeYunlefunIdentity(auth, {
        clientId: ssoClientId.value,
        exchangeUrl: ssoExchangeUrl.value,
        redirectUri: ssoRedirectUri.value,
        ssoOrigin: ssoOrigin.value,
      }, {
        beforeRedirect: options.beforeRedirect,
        isCurrent: context.isCurrent,
        mode,
      })

      if (result.status === 'superseded' || !context.isCurrent()) {
        if (auth.signOut)
          await auth.signOut()
        account.value = null
        status.value = 'signed-out'
        return false
      }

      if (result.status === 'adopted') {
        if (!await refreshCurrentIdentity(auth, context))
          return false
        inNativeApp.value = result.source === 'host'
        if (result.returnPath)
          await navigateTo(result.returnPath, { replace: true })
        return true
      }

      if (result.status === 'rejected')
        lastFailure.value = result.reason
      if (!await refreshCurrentIdentity(auth, context))
        return false
      if (mode === 'interactive'
        && result.status === 'rejected'
        && result.reason !== 'not_authenticated') {
        status.value = 'error'
      }
      return false
    }
    catch (error) {
      if (!context.isCurrent())
        return false
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = mode === 'interactive' ? 'error' : 'signed-out'
      return false
    }
  }

  async function refreshCurrentIdentity(
    auth: YunlefunAuthClient,
    context: { isCurrent: () => boolean },
  ): Promise<boolean> {
    const state = await getLoginState(auth)
    if (!context.isCurrent()) {
      if (auth.signOut)
        await auth.signOut()
      account.value = null
      status.value = 'signed-out'
      return false
    }
    syncLoginState(state)
    return true
  }

  async function syncSilently(): Promise<boolean> {
    if (silentAttempted.value)
      return isAuthenticated.value

    silentAttempted.value = true
    const synchronized = await signIn('silent')
    return synchronized || isAuthenticated.value
  }

  async function resyncFromHost(): Promise<void> {
    await identitySynchronization.supersede(async (context) => {
      const auth = await ensureAuth(cloudbaseEnv.value)
      if (auth?.signOut)
        await auth.signOut()
      account.value = null
      status.value = 'checking'
      silentAttempted.value = false
      await runSignIn('silent', {}, context)
    })
  }

  async function signOut(): Promise<void> {
    await identitySynchronization.supersede(async () => {
      const auth = await ensureAuth(cloudbaseEnv.value)
      if (auth?.signOut)
        await auth.signOut()

      account.value = null
      status.value = 'signed-out'
      lastFailure.value = null
      lastError.value = null
      silentAttempted.value = false
    })
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

function attachHostIdentityListener(resync: () => Promise<void>): void {
  if (!import.meta.client || hostIdentityListenerAttached)
    return
  hostIdentityListenerAttached = true
  window.addEventListener('ylf:identityChanged', () => {
    void resync()
  })
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
    loginStatePublication.publish(() => {
      syncLoginState(state)
    })
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
