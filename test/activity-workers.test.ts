import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createActivityDeadlineWorker,
  createActivityOutboxPublisher,
  publicOutboxNotification,
} = require('../cloudbase/functions/saier-room-api/activity-workers.cjs') as {
  createActivityDeadlineWorker: (options: Record<string, any>) => Record<string, (...args: any[]) => Promise<any>>
  createActivityOutboxPublisher: (options: Record<string, any>) => Record<string, (...args: any[]) => Promise<any>>
  publicOutboxNotification: (record: Record<string, any>) => Record<string, any>
}

describe('activity durable workers', () => {
  it('publishes before marking and safely repeats after a mark crash', async () => {
    const record = {
      activityEpoch: 2,
      eventIds: ['event-3'],
      id: 'outbox-1',
      latestEventSeq: 3,
      privateAudienceUserIds: ['drawer'],
      publishedAt: null,
      roomId: 'room-1',
      sessionId: 'session-1',
    }
    const published: Array<Record<string, unknown>> = []
    let failMark = true
    const publisher = createActivityOutboxPublisher({
      now: () => 2000,
      publish: async (value: Record<string, unknown>) => void published.push(value),
      repo: {
        listPendingActivityOutbox: async () => record.publishedAt === null ? [record] : [],
        markActivityOutboxPublished: async (_id: string, publishedAt: number) => {
          if (failMark) {
            failMark = false
            throw new Error('crash after publish')
          }
          record.publishedAt = publishedAt as never
        },
      },
    })

    await expect(publisher.publishPending()).rejects.toThrow('crash after publish')
    await expect(publisher.publishPending()).resolves.toEqual([{ id: 'outbox-1', publishedAt: 2000 }])

    expect(published).toHaveLength(2)
    expect(published[0]).toEqual(published[1])
    expect(published[0]).toMatchObject({
      latestEventSeq: 3,
      sessionId: 'session-1',
      type: 'activityCommitted',
    })
  })

  it('never projects arbitrary outbox fields into realtime notifications', () => {
    const notification = publicOutboxNotification({
      activityEpoch: 1,
      answer: 'secret answer',
      candidates: ['secret answer'],
      eventIds: ['event-1'],
      latestEventSeq: 1,
      roomId: 'room-1',
      sessionId: 'session-1',
    })

    expect(JSON.stringify(notification)).not.toContain('secret answer')
    expect(notification).not.toHaveProperty('answer')
    expect(notification).not.toHaveProperty('candidates')
  })

  it('keeps the NoSQL deadline scan independent from Redis index rebuilding', async () => {
    const processDueSessions = vi.fn(async () => [{ ok: true }])
    const worker = createActivityDeadlineWorker({
      commandService: { processDueSessions },
      deadlineIndex: {
        add: async () => {
          throw new Error('redis unavailable')
        },
      },
      repo: {
        listActiveActivitySessions: async () => [{
          activityEpoch: 1,
          deadlineAt: 1000,
          phase: 'drawing',
          phaseEpoch: 3,
          round: { roundId: 'round-1' },
          sessionId: 'session-1',
        }],
      },
    })

    await expect(worker.rebuildAccelerationIndex()).rejects.toThrow('redis unavailable')
    await expect(worker.scanDue()).resolves.toEqual([{ ok: true }])
    expect(processDueSessions).toHaveBeenCalledOnce()
  })
})
