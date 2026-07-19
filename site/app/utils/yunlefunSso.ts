const DEFAULT_YUNLEFUN_SSO_ORIGIN = 'https://www.yunle.fun'

/**
 * Keep the official SSO popup handshake, but enter it through the provider's
 * login page so signed-out users are not rejected before they can authenticate.
 */
export async function withYunlefunInteractiveLoginPopup<TResult>(
  ssoOrigin: string,
  request: () => Promise<TResult>,
): Promise<TResult> {
  if (typeof window === 'undefined')
    return request()

  const originalOpen = window.open
  let interceptedOpen: typeof window.open

  function restoreOpen(): void {
    if (window.open === interceptedOpen)
      window.open = originalOpen
  }

  interceptedOpen = (url, target, features) => {
    const loginUrl = createInteractiveLoginUrl(url, ssoOrigin)
    if (loginUrl)
      restoreOpen()
    return originalOpen.call(window, loginUrl ?? url, target, features)
  }

  window.open = interceptedOpen
  try {
    return await request()
  }
  finally {
    restoreOpen()
  }
}

function createInteractiveLoginUrl(
  requestUrl: string | URL | undefined,
  ssoOrigin: string,
): string | undefined {
  if (!requestUrl)
    return undefined

  try {
    const providerUrl = new URL(ssoOrigin || DEFAULT_YUNLEFUN_SSO_ORIGIN)
    const requestUrlValue = new URL(String(requestUrl))
    if (
      requestUrlValue.origin !== providerUrl.origin
      || requestUrlValue.pathname !== '/auth/sso'
      || requestUrlValue.searchParams.get('mode') !== 'interactive'
    ) {
      return undefined
    }

    const loginUrl = new URL('/login', providerUrl.origin)
    loginUrl.searchParams.set('redirect', `${requestUrlValue.pathname}${requestUrlValue.search}`)
    return loginUrl.toString()
  }
  catch {
    return undefined
  }
}
