import { describe, expect, it } from 'vitest'
import {
  createSiteActivityHref,
  createSiteActivityLocation,
  parseLegacyPictionaryRoute,
  parsePictionaryJoinTarget,
  parseSiteActivityPluginQuery,
} from '../site/app/utils/activityPluginRoutes'

describe('site activity plugin routes', () => {
  it('parses only supported activity requests with valid room ids', () => {
    expect(parseSiteActivityPluginQuery({ activity: 'pictionary' })).toEqual({
      inviteToken: undefined,
      roomId: undefined,
      type: 'pictionary',
    })
    expect(parseSiteActivityPluginQuery({
      activity: 'pictionary',
      activityRoom: 'sr_room-1',
      invite: 'invite-1',
    })).toEqual({
      inviteToken: 'invite-1',
      roomId: 'sr_room-1',
      type: 'pictionary',
    })
    expect(parseSiteActivityPluginQuery({ activity: 'unknown', activityRoom: 'sr_room-1' })).toBeNull()
    expect(parseSiteActivityPluginQuery({ activity: 'pictionary', activityRoom: '../room' })).toBeNull()
  })

  it('creates a root activity location and share url', () => {
    const request = { inviteToken: 'invite-1', roomId: 'sr_room-1', type: 'pictionary' as const }
    expect(createSiteActivityLocation(request)).toEqual({
      path: '/',
      query: {
        activity: 'pictionary',
        activityRoom: 'sr_room-1',
        invite: 'invite-1',
      },
    })
    expect(createSiteActivityHref(request, 'https://saier.example')).toBe(
      'https://saier.example/?activity=pictionary&activityRoom=sr_room-1&invite=invite-1',
    )
  })

  it('accepts root plugin links, legacy links, and raw room ids', () => {
    const origin = 'https://saier.example'
    expect(parsePictionaryJoinTarget(
      'https://saier.example/?activity=pictionary&activityRoom=sr_new&invite=new-token',
      origin,
    )).toEqual({ inviteToken: 'new-token', roomId: 'sr_new', type: 'pictionary' })
    expect(parsePictionaryJoinTarget('/games/pictionary/sr_legacy?invite=old-token', origin)).toEqual({
      inviteToken: 'old-token',
      roomId: 'sr_legacy',
      type: 'pictionary',
    })
    expect(parsePictionaryJoinTarget('sr_raw', origin)).toEqual({ roomId: 'sr_raw', type: 'pictionary' })
    expect(parsePictionaryJoinTarget('/invalid/path', origin)).toBeNull()
  })

  it('maps legacy pages to plugin requests without keeping page components', () => {
    expect(parseLegacyPictionaryRoute('/games/pictionary')).toEqual({ type: 'pictionary' })
    expect(parseLegacyPictionaryRoute('/games/pictionary/')).toEqual({ type: 'pictionary' })
    expect(parseLegacyPictionaryRoute('/games/pictionary/sr_room-1', { invite: 'old-token' })).toEqual({
      inviteToken: 'old-token',
      roomId: 'sr_room-1',
      type: 'pictionary',
    })
    expect(parseLegacyPictionaryRoute('/games/pictionary/%2E%2E')).toBeNull()
    expect(parseLegacyPictionaryRoute('/games/pictionary/sr_room-1/extra')).toBeNull()
  })
})
