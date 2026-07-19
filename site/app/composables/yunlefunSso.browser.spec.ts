import { requestSso } from '@yunlefun/sso/legacy'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withYunlefunInteractiveLoginPopup } from '../utils/yunlefunSso'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('yunlefun SSO request', () => {
  it('opens provider login with a PKCE-bound SSO redirect', async () => {
    let openedUrl = ''
    vi.spyOn(window, 'open').mockImplementation((url) => {
      openedUrl = String(url)
      return { closed: true } as Window
    })

    await withYunlefunInteractiveLoginPopup('https://www.yunle.fun', () =>
      requestSso({
        allowHttpLocalhost: true,
        mode: 'interactive',
        ssoOrigin: 'https://www.yunle.fun',
        timeoutMs: 1,
      }))

    const loginUrl = new URL(openedUrl)
    const redirect = loginUrl.searchParams.get('redirect')
    expect(loginUrl.origin).toBe('https://www.yunle.fun')
    expect(loginUrl.pathname).toBe('/login')
    expect(redirect).not.toBeNull()
    if (!redirect)
      throw new Error('missing SSO redirect')

    const requestUrl = new URL(redirect, loginUrl.origin)
    expect(requestUrl.searchParams.get('mode')).toBe('interactive')
    expect(requestUrl.searchParams.get('targetOrigin')).toBe(window.location.origin)
    expect(requestUrl.searchParams.get('codeChallenge')).toMatch(/^[\w-]{43}$/)
    expect(requestUrl.searchParams.get('codeChallengeMethod')).toBe('S256')
  })
})
