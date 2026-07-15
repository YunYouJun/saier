import type { SiteActivityPluginType } from '~/activity-plugins/registry'
import { isSiteActivityPluginType } from '~/activity-plugins/registry'

export interface SiteActivityPluginRequest {
  inviteToken?: string
  roomId?: string
  type: SiteActivityPluginType
}

export type SiteActivityQueryValue = null | string | Array<null | string> | undefined

export interface SiteActivityLocation {
  path: '/'
  query: Record<string, string>
}

export interface LegacyPictionaryRoute {
  inviteToken?: string
  roomId?: string
  type: 'pictionary'
}

const ROOM_ID_PATTERN = /^[\w-]{1,128}$/u

function firstQueryValue(value: SiteActivityQueryValue): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined
}

export function parseSiteActivityPluginQuery(
  query: Readonly<Record<string, SiteActivityQueryValue>>,
): SiteActivityPluginRequest | null {
  const type = firstQueryValue(query.activity)
  const roomId = firstQueryValue(query.activityRoom)
  if (!type || !isSiteActivityPluginType(type) || (roomId !== undefined && !ROOM_ID_PATTERN.test(roomId)))
    return null
  return {
    inviteToken: firstQueryValue(query.invite),
    roomId,
    type,
  }
}

export function createSiteActivityLocation(request: SiteActivityPluginRequest): SiteActivityLocation {
  const query: Record<string, string> = {
    activity: request.type,
  }
  if (request.roomId)
    query.activityRoom = request.roomId
  if (request.inviteToken)
    query.invite = request.inviteToken
  return { path: '/', query }
}

export function createSiteActivityHref(request: SiteActivityPluginRequest, origin: string): string {
  const url = new URL('/', origin)
  const location = createSiteActivityLocation(request)
  for (const [key, value] of Object.entries(location.query))
    url.searchParams.set(key, value)
  return url.toString()
}

export function parseLegacyPictionaryRoute(
  path: string,
  query: Readonly<Record<string, SiteActivityQueryValue>> = {},
): LegacyPictionaryRoute | null {
  if (/^\/games\/pictionary\/?$/u.test(path))
    return { type: 'pictionary' }

  const match = path.match(/^\/games\/pictionary\/([^/]+)\/?$/u)
  if (!match)
    return null

  let roomId: string
  try {
    roomId = decodeURIComponent(match[1]!)
  }
  catch {
    return null
  }

  if (!ROOM_ID_PATTERN.test(roomId))
    return null

  return {
    inviteToken: firstQueryValue(query.invite),
    roomId,
    type: 'pictionary',
  }
}

export function parsePictionaryJoinTarget(value: string, origin: string): SiteActivityPluginRequest | null {
  const trimmed = value.trim()
  if (!trimmed)
    return null
  if (ROOM_ID_PATTERN.test(trimmed))
    return { roomId: trimmed, type: 'pictionary' }

  let url: URL
  try {
    url = new URL(trimmed, origin)
  }
  catch {
    return null
  }

  const queryRequest = parseSiteActivityPluginQuery({
    activity: url.searchParams.get('activity'),
    activityRoom: url.searchParams.get('activityRoom'),
    invite: url.searchParams.get('invite'),
  })
  if (queryRequest)
    return queryRequest

  return parseLegacyPictionaryRoute(url.pathname, {
    invite: url.searchParams.get('invite'),
  })
}
