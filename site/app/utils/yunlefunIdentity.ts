import type {
  SsoAdoptionAuth,
  SsoAuthorizationResult,
  SsoFailureReason,
} from '@yunlefun/sso'

import {
  adoptSsoCode,
  consumeSsoRedirect,
  startSsoRedirect,
} from '@yunlefun/sso'
import { requestHostSsoAuthorization } from '@yunlefun/sso/browser'

const SAIER_SSO_SCOPE = Object.freeze(['identity:bootstrap'] as const)
const SAIER_SSO_RETURN_PATH_KEY = 'saier:sso:v3:return-path'

export interface YunlefunIdentityConfig {
  clientId: string
  exchangeUrl: string
  redirectUri: string
  ssoOrigin: string
}

export type YunlefunIdentityResult
  = | {
    source: 'host' | 'redirect'
    status: 'adopted'
    returnPath?: string
  }
  | {
    status: 'redirecting'
  }
  | {
    status: 'unavailable'
  }
  | {
    status: 'superseded'
  }
  | {
    reason: SsoFailureReason
    status: 'rejected'
  }

export interface YunlefunIdentitySyncOptions {
  beforeRedirect?: () => Promise<void> | void
  isCurrent?: () => boolean
  mode: 'interactive' | 'silent'
}

export interface IdentitySynchronizationContext {
  isCurrent: () => boolean
}

export interface IdentitySynchronizationCoordinator {
  run: <T>(
    task: (context: IdentitySynchronizationContext) => Promise<T>,
  ) => Promise<T>
  supersede: <T>(
    task: (context: IdentitySynchronizationContext) => Promise<T>,
  ) => Promise<T>
}

export interface LoginStatePublicationGate {
  publish: (publishState: () => void) => boolean
  run: <T>(mutation: () => Promise<T>) => Promise<T>
}

interface YunlefunIdentityDependencies {
  adoptCode: typeof adoptSsoCode
  consumeRedirect: typeof consumeSsoRedirect
  requestHostAuthorization: typeof requestHostSsoAuthorization
  startRedirect: typeof startSsoRedirect
}

const defaultDependencies: YunlefunIdentityDependencies = {
  adoptCode: adoptSsoCode,
  consumeRedirect: consumeSsoRedirect,
  requestHostAuthorization: requestHostSsoAuthorization,
  startRedirect: startSsoRedirect,
}

/**
 * Serializes session mutations and invalidates older work as soon as the host
 * announces an account change. A superseding task never overlaps an earlier
 * authorization-code adoption.
 */
export function createIdentitySynchronizationCoordinator(): IdentitySynchronizationCoordinator {
  let generation = 0
  let queue: Promise<unknown> = Promise.resolve()

  function enqueue<T>(
    taskGeneration: number,
    task: (context: IdentitySynchronizationContext) => Promise<T>,
  ): Promise<T> {
    const result = queue.then(() => task({
      isCurrent: () => taskGeneration === generation,
    }))
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  return {
    run: task => enqueue(generation, task),
    supersede: (task) => {
      generation += 1
      return enqueue(generation, task)
    },
  }
}

/**
 * Prevents auth SDK callbacks from exposing an intermediate account while a
 * serialized session mutation is still being validated.
 */
export function createLoginStatePublicationGate(): LoginStatePublicationGate {
  let activeMutations = 0

  return {
    publish: (publishState) => {
      if (activeMutations > 0)
        return false
      publishState()
      return true
    },
    run: async (mutation) => {
      activeMutations += 1
      try {
        return await mutation()
      }
      finally {
        activeMutations -= 1
      }
    },
  }
}

/**
 * Synchronizes Saier's own CloudBase session from either a trusted Apps host or
 * the standard top-level SSO redirect. No YunLeFun session or token crosses
 * the host seam; both paths exchange a one-time code bound to PKCE and nonce.
 */
export async function synchronizeYunlefunIdentity(
  auth: SsoAdoptionAuth,
  config: YunlefunIdentityConfig,
  options: YunlefunIdentitySyncOptions,
  dependencies: YunlefunIdentityDependencies = defaultDependencies,
): Promise<YunlefunIdentityResult> {
  const redirectAuthorization = dependencies.consumeRedirect()
  if (redirectAuthorization) {
    if (!redirectAuthorization.ok) {
      clearReturnPath()
      return {
        reason: redirectAuthorization.reason,
        status: 'rejected',
      }
    }

    if (!isCurrent(options)) {
      clearReturnPath()
      return { status: 'superseded' }
    }
    const adopted = await adoptAuthorization(auth, redirectAuthorization, config, dependencies)
    if (!isCurrent(options)) {
      clearReturnPath()
      return { status: 'superseded' }
    }
    if (!adopted) {
      clearReturnPath()
      return { reason: 'invalid_request', status: 'rejected' }
    }
    return {
      source: 'redirect',
      status: 'adopted',
      ...readAndClearReturnPath(),
    }
  }

  const hostAuthorization = await dependencies.requestHostAuthorization({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: SAIER_SSO_SCOPE,
    ssoOrigin: config.ssoOrigin,
  })
  if (hostAuthorization) {
    if (!isCurrent(options))
      return { status: 'superseded' }
    const adopted = await adoptAuthorization(auth, hostAuthorization, config, dependencies)
    if (!isCurrent(options))
      return { status: 'superseded' }
    return adopted
      ? { source: 'host', status: 'adopted' }
      : { reason: 'invalid_request', status: 'rejected' }
  }

  if (options.mode === 'silent')
    return { status: 'unavailable' }

  if (!isCurrent(options))
    return { status: 'superseded' }
  await options.beforeRedirect?.()
  if (!isCurrent(options))
    return { status: 'superseded' }
  storeReturnPath()
  try {
    await dependencies.startRedirect({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: SAIER_SSO_SCOPE,
      ssoOrigin: config.ssoOrigin,
    })
  }
  catch (error) {
    clearReturnPath()
    throw error
  }
  return { status: 'redirecting' }
}

function isCurrent(options: YunlefunIdentitySyncOptions): boolean {
  return options.isCurrent?.() !== false
}

async function adoptAuthorization(
  auth: SsoAdoptionAuth,
  authorization: SsoAuthorizationResult,
  config: YunlefunIdentityConfig,
  dependencies: YunlefunIdentityDependencies,
): Promise<boolean> {
  return dependencies.adoptCode(auth, authorization, {
    exchangeUrl: config.exchangeUrl,
  })
}

function storeReturnPath(): void {
  if (typeof window === 'undefined')
    return
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  try {
    window.sessionStorage.setItem(SAIER_SSO_RETURN_PATH_KEY, returnPath)
  }
  catch {
    // startSsoRedirect reports unavailable transaction storage separately.
  }
}

function readAndClearReturnPath(): { returnPath?: string } {
  if (typeof window === 'undefined')
    return {}
  let returnPath = ''
  try {
    returnPath = window.sessionStorage.getItem(SAIER_SSO_RETURN_PATH_KEY) ?? ''
    window.sessionStorage.removeItem(SAIER_SSO_RETURN_PATH_KEY)
  }
  catch {
    return {}
  }
  return isSameOriginPath(returnPath) ? { returnPath } : {}
}

function clearReturnPath(): void {
  if (typeof window === 'undefined')
    return
  try {
    window.sessionStorage.removeItem(SAIER_SSO_RETURN_PATH_KEY)
  }
  catch {
    // Nothing sensitive remains outside this origin.
  }
}

function isSameOriginPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//'))
    return false
  try {
    return new URL(value, window.location.origin).origin === window.location.origin
  }
  catch {
    return false
  }
}
