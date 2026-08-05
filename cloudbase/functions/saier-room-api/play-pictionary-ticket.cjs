const DEFAULT_TIMEOUT_MS = 5_000

function createPlayPictionaryTicketService(options = {}) {
  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl)
  const realtimeUrl = normalizeRealtimeUrl(options.realtimeUrl, apiBaseUrl)
  const token = stringValue(options.token)
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS

  return {
    configured: Boolean(apiBaseUrl && realtimeUrl && token && typeof fetchImpl === 'function'),
    async issue(input) {
      if (!apiBaseUrl || !realtimeUrl || !token || typeof fetchImpl !== 'function')
        throw playTicketError('backend_unavailable', 'Play Pictionary ticket issuer is not configured.')
      const response = await fetchImpl(new URL('/v1/pictionary/session-tickets', apiBaseUrl), {
        body: JSON.stringify({
          publicState: input.publicState,
          secretState: input.secretState,
          user: input.user,
        }),
        headers: {
          'authorization': `Bearer ${token}`,
          'content-type': 'application/json',
          'x-yunlefun-app-id': 'saier',
        },
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const body = await safeJson(response)
      if (!response.ok) {
        throw playTicketError(
          response.status === 403 ? 'forbidden' : 'backend_unavailable',
          stringValue(body?.message) ?? `Play ticket issuer failed with HTTP ${response.status}.`,
        )
      }
      if (typeof body?.ticket !== 'string'
        || typeof body?.sessionId !== 'string'
        || body.roomType !== 'pictionary_room') {
        throw playTicketError('backend_unavailable', 'Play ticket issuer returned an invalid response.')
      }
      return {
        expiresAt: Date.parse(body.expiresAt),
        realtimeUrl,
        roomType: 'pictionary_room',
        sessionId: body.sessionId,
        ticket: body.ticket,
      }
    },
  }
}

async function safeJson(response) {
  try {
    return await response.json()
  }
  catch {
    return undefined
  }
}

function normalizeBaseUrl(value) {
  const raw = stringValue(value)
  if (!raw)
    return undefined
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new TypeError('Play API URL must use HTTP or HTTPS.')
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function normalizeRealtimeUrl(value, apiBaseUrl) {
  const raw = stringValue(value)
  if (!raw && !apiBaseUrl)
    return undefined
  const url = new URL(raw ?? apiBaseUrl ?? 'http://localhost')
  if (!raw && apiBaseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (!['ws:', 'wss:'].includes(url.protocol))
    throw new TypeError('Play realtime URL must use WS or WSS.')
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return apiBaseUrl || raw ? url.toString() : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function playTicketError(code, message) {
  const error = new Error(code)
  error.code = code
  error.reason = code
  error.detail = message
  return error
}

module.exports = {
  createPlayPictionaryTicketService,
}
