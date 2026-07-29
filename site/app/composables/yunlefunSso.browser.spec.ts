import type { SsoAuthorizationResult } from '@yunlefun/sso/browser'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createIdentitySynchronizationCoordinator,
  createLoginStatePublicationGate,
  synchronizeYunlefunIdentity,
} from '../utils/yunlefunIdentity'

const authorization = Object.freeze({
  ok: true,
  clientId: 'saier-web',
  code: 'code_'.padEnd(43, 'c'),
  codeVerifier: 'verifier_'.padEnd(43, 'v'),
  issuer: 'https://www.yunle.fun',
  nonce: 'nonce_'.padEnd(43, 'n'),
  redirectUri: 'https://saier.yunle.fun/',
  scope: Object.freeze(['identity:bootstrap']),
}) satisfies SsoAuthorizationResult

const config = {
  clientId: 'saier-web',
  exchangeUrl: 'https://api.yunle.fun/sso-ticket',
  redirectUri: 'https://saier.yunle.fun/',
  ssoOrigin: 'https://www.yunle.fun',
}

const auth = {
  signInWithCustomTicket: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  window.sessionStorage.clear()
})

describe('yunlefun identity synchronization', () => {
  it('does not publish transient login states while a session mutation is pending', async () => {
    const gate = createLoginStatePublicationGate()
    const publish = vi.fn()
    let releaseMutation!: () => void
    const mutationBlocked = new Promise<void>((resolve) => {
      releaseMutation = resolve
    })

    const mutation = gate.run(async () => {
      expect(gate.publish(publish)).toBe(false)
      await mutationBlocked
      expect(gate.publish(publish)).toBe(false)
    })
    await Promise.resolve()
    expect(publish).not.toHaveBeenCalled()

    releaseMutation()
    await mutation
    expect(gate.publish(publish)).toBe(true)
    expect(publish).toHaveBeenCalledOnce()
  })

  it('keeps a queued refresh from publishing an identity superseded by the host', async () => {
    const coordinator = createIdentitySynchronizationCoordinator()
    const publication = createLoginStatePublicationGate()
    const published = vi.fn()
    let releaseAdoption!: () => void
    let markAdoptionStarted!: () => void
    const adoptionStarted = new Promise<void>((resolve) => {
      markAdoptionStarted = resolve
    })
    const adoptionBlocked = new Promise<void>((resolve) => {
      releaseAdoption = resolve
    })

    const adoption = coordinator.run(context => publication.run(async () => {
      markAdoptionStarted()
      publication.publish(() => published('SDK callback'))
      await adoptionBlocked
      if (context.isCurrent())
        published('older adoption')
    }))
    await adoptionStarted

    const refresh = coordinator.run(context => publication.run(async () => {
      if (context.isCurrent())
        published('older refresh')
    }))
    const hostChange = coordinator.supersede(context => publication.run(async () => {
      if (context.isCurrent())
        published('new host identity')
    }))

    releaseAdoption()
    await Promise.all([adoption, refresh, hostChange])
    expect(published).toHaveBeenCalledOnce()
    expect(published).toHaveBeenCalledWith('new host identity')
  })

  it('serializes account changes and marks the older authorization stale', async () => {
    const coordinator = createIdentitySynchronizationCoordinator()
    let releaseOlder!: () => void
    let markOlderStarted!: () => void
    const olderStarted = new Promise<void>((resolve) => {
      markOlderStarted = resolve
    })
    const olderBlocked = new Promise<void>((resolve) => {
      releaseOlder = resolve
    })
    const events: string[] = []

    const older = coordinator.run(async ({ isCurrent }) => {
      events.push('older:start')
      markOlderStarted()
      await olderBlocked
      events.push(isCurrent() ? 'older:current' : 'older:stale')
    })
    await olderStarted

    const newer = coordinator.supersede(async ({ isCurrent }) => {
      events.push(isCurrent() ? 'newer:current' : 'newer:stale')
    })
    releaseOlder()
    await Promise.all([older, newer])

    expect(events).toEqual([
      'older:start',
      'older:stale',
      'newer:current',
    ])
  })

  it('adopts a one-time authorization from the Apps host without redirecting', async () => {
    const adoptCode = vi.fn().mockResolvedValue(true)
    const startRedirect = vi.fn()

    const result = await synchronizeYunlefunIdentity(auth, config, {
      mode: 'silent',
    }, {
      adoptCode,
      consumeRedirect: vi.fn(),
      requestHostAuthorization: vi.fn().mockResolvedValue(authorization),
      startRedirect,
    })

    expect(result).toEqual({ source: 'host', status: 'adopted' })
    expect(adoptCode).toHaveBeenCalledWith(auth, authorization, {
      exchangeUrl: 'https://api.yunle.fun/sso-ticket',
    })
    expect(startRedirect).not.toHaveBeenCalled()
  })

  it('preserves the current Saier route across an interactive top-level redirect', async () => {
    window.history.replaceState({}, '', '/rooms/paint?invite=abc')
    const beforeRedirect = vi.fn()
    const startRedirect = vi.fn().mockResolvedValue(undefined)
    const dependencies = {
      adoptCode: vi.fn().mockResolvedValue(true),
      consumeRedirect: vi.fn(),
      requestHostAuthorization: vi.fn().mockResolvedValue(null),
      startRedirect,
    }

    await expect(synchronizeYunlefunIdentity(auth, config, {
      beforeRedirect,
      mode: 'interactive',
    }, dependencies)).resolves.toEqual({ status: 'redirecting' })
    expect(beforeRedirect).toHaveBeenCalledOnce()
    expect(startRedirect).toHaveBeenCalledWith({
      clientId: 'saier-web',
      redirectUri: 'https://saier.yunle.fun/',
      scope: ['identity:bootstrap'],
      ssoOrigin: 'https://www.yunle.fun',
    })

    dependencies.consumeRedirect.mockReturnValue(authorization)
    await expect(synchronizeYunlefunIdentity(auth, config, {
      mode: 'silent',
    }, dependencies)).resolves.toEqual({
      returnPath: '/rooms/paint?invite=abc',
      source: 'redirect',
      status: 'adopted',
    })
  })

  it('returns the provider rejection without attempting to adopt a session', async () => {
    const adoptCode = vi.fn()

    const result = await synchronizeYunlefunIdentity(auth, config, {
      mode: 'silent',
    }, {
      adoptCode,
      consumeRedirect: vi.fn().mockReturnValue({
        ok: false,
        reason: 'not_authenticated',
      }),
      requestHostAuthorization: vi.fn().mockResolvedValue(null),
      startRedirect: vi.fn(),
    })

    expect(result).toEqual({
      reason: 'not_authenticated',
      status: 'rejected',
    })
    expect(adoptCode).not.toHaveBeenCalled()
  })

  it('does not retain a return route when redirect startup fails', async () => {
    window.history.replaceState({}, '', '/rooms/private')
    const dependencies = {
      adoptCode: vi.fn().mockResolvedValue(true),
      consumeRedirect: vi.fn(),
      requestHostAuthorization: vi.fn().mockResolvedValue(null),
      startRedirect: vi.fn().mockRejectedValue(new Error('transaction storage unavailable')),
    }

    await expect(synchronizeYunlefunIdentity(auth, config, {
      mode: 'interactive',
    }, dependencies)).rejects.toThrow('transaction storage unavailable')

    dependencies.consumeRedirect.mockReturnValue(authorization)
    await expect(synchronizeYunlefunIdentity(auth, config, {
      mode: 'silent',
    }, dependencies)).resolves.toEqual({
      source: 'redirect',
      status: 'adopted',
    })
  })

  it('does nothing when neither a host nor a redirect result is available', async () => {
    await expect(synchronizeYunlefunIdentity(auth, config, {
      mode: 'silent',
    }, {
      adoptCode: vi.fn(),
      consumeRedirect: vi.fn().mockReturnValue(null),
      requestHostAuthorization: vi.fn().mockResolvedValue(null),
      startRedirect: vi.fn(),
    })).resolves.toEqual({ status: 'unavailable' })
  })
})
