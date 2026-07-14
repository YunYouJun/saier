import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const core = require('../cloudbase/run/saier-realtime/gateway-core.cjs') as any

describe('realtime gateway core', () => {
  it('requires a small authentication first frame and validates origins', () => {
    expect(core.validateOrigin('https://saier.yunle.fun', ['https://saier.yunle.fun'])).toBe(true)
    expect(core.validateOrigin('https://evil.example', ['https://saier.yunle.fun'])).toBe(false)
    expect(() => core.parseFrame(JSON.stringify({ type: 'resume' }), false)).toThrow('AUTH_REQUIRED')
    expect(core.parseFrame(JSON.stringify({ type: 'auth', token: 'token' }), false)).toEqual({ type: 'auth', token: 'token' })
    expect(() => core.parseFrame(JSON.stringify({ type: 'auth', padding: 'x'.repeat(5000) }), false)).toThrow('FRAME_TOO_LARGE')
  })

  it('enforces pre-auth, connection-rate, and per-user-room quotas', () => {
    let now = 1000
    const quota = new core.ConnectionQuota({
      maxAuthenticatedPerUserRoom: 1,
      maxConnectionsPerMinute: 2,
      maxPreAuthPerIp: 1,
      now: () => now,
    })
    expect(quota.acquirePreAuth('ip-1')).toBe(true)
    expect(quota.acquirePreAuth('ip-1')).toBe(false)
    expect(quota.authenticate('ip-1', 'user-1', 'room-1', 'connection-1')).toBe(true)
    expect(quota.acquirePreAuth('ip-1')).toBe(true)
    expect(quota.authenticate('ip-1', 'user-1', 'room-1', 'connection-2')).toBe(false)
    quota.releasePreAuth('ip-1')
    now += 60_001
    expect(quota.acquirePreAuth('ip-1')).toBe(true)
  })

  it('fences and bounds preview payloads', () => {
    const authority = {
      activityEpoch: 2,
      brushVersion: 'saier.activity-brush.v1',
      controllerEpoch: 4,
      drawerId: 'drawer',
      phaseEpoch: 3,
      roundId: 'round-1',
      sessionId: 'session-1',
      userId: 'drawer',
    }
    const frame = {
      activityEpoch: 2,
      brushVersion: 'saier.activity-brush.v1',
      controllerEpoch: 4,
      phaseEpoch: 3,
      points: [{ x: 1, y: 2, pressure: 1 }],
      previewSeq: 1,
      roundId: 'round-1',
      sessionId: 'session-1',
      strokeId: 'stroke-1',
      type: 'preview',
      tool: 'pen',
    }
    expect(core.validatePreview(frame, authority)).toMatchObject({ strokeId: 'stroke-1' })
    expect(() => core.validatePreview({ ...frame, controllerEpoch: 3 }, authority)).toThrow('STALE_PREVIEW')
    expect(() => core.validatePreview({ ...frame, points: [{ x: Number.NaN, y: 2 }] }, authority)).toThrow('INVALID_PREVIEW')
    expect(() => core.validatePreview({ ...frame, points: Array.from({ length: 33 }, () => ({ x: 1, y: 2 })) }, authority)).toThrow('INVALID_PREVIEW')
  })

  it('drops previews and merges presence before refusing committed events', () => {
    const queue = new core.OutboundQueue(100)
    expect(queue.enqueue({ kind: 'preview', key: 'stroke-1', data: 'x'.repeat(40) }).accepted).toBe(true)
    expect(queue.enqueue({ kind: 'preview', key: 'stroke-1', data: 'y'.repeat(40) }).accepted).toBe(true)
    expect(queue.entries).toHaveLength(1)
    expect(queue.enqueue({ kind: 'presence', key: 'room-1', data: 'p'.repeat(40) }).accepted).toBe(true)
    expect(queue.enqueue({ kind: 'committed', data: 'c'.repeat(80) }).accepted).toBe(true)
    expect(queue.entries.some((entry: any) => entry.kind === 'preview')).toBe(false)
    expect(queue.entries.some((entry: any) => entry.kind === 'committed')).toBe(true)

    const blocked = queue.enqueue({ kind: 'committed', data: 'z'.repeat(80) })
    expect(blocked).toEqual({ accepted: false, closeForResync: true })
  })

  it('only allows the recovery barrier state sequence', () => {
    expect(core.transitionTransport('degraded-polling', 'resyncing')).toBe('resyncing')
    expect(core.transitionTransport('resyncing', 'recovered')).toBe('recovered')
    expect(core.transitionTransport('recovered', 'realtime')).toBe('realtime')
    expect(() => core.transitionTransport('degraded-polling', 'realtime')).toThrow('INVALID_TRANSPORT_TRANSITION')
  })

  it('broadcasts public committed invalidations to everyone and targets private refreshes', () => {
    const notification = {
      activityEpoch: 2,
      latestEventSeq: 4,
      privateAudienceUserIds: ['drawer'],
      privateProjectionRevision: 3,
      sessionId: 'session-1',
      type: 'activityCommitted',
    }
    expect(core.projectCommittedNotification(notification, 'guesser')).toEqual([
      expect.not.objectContaining({ privateAudienceUserIds: expect.anything() }),
    ])
    expect(core.projectCommittedNotification(notification, 'drawer')).toEqual([
      expect.objectContaining({ latestEventSeq: 4, type: 'activityCommitted' }),
      expect.objectContaining({ type: 'privateProjectionInvalidated' }),
    ])
  })
})
