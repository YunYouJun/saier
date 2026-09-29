import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const guardrails = require('../cloudbase/functions/saier-room-api/pictionary-ai-guardrails.cjs') as {
  createPictionaryAiAudit: (options: Record<string, unknown>) => {
    record: (event: string, input: Record<string, unknown>) => void
  }
  createPictionaryAiUsageLimiter: (options: Record<string, unknown>) => {
    reserve: (input: { requestId: string, sessionId: string, userId: string }) => Promise<Record<string, unknown>>
  }
  parseDailyLimit: (value: string | undefined, fallback: number, name: string) => number
}

describe('pictionary AI guardrails', () => {
  it('enforces a per-user daily limit without consuming the global remainder', async () => {
    const repo = createUsageRepo()
    const limiter = guardrails.createPictionaryAiUsageLimiter({
      globalDailyLimit: 10,
      now: () => Date.UTC(2026, 7, 31, 12),
      repo,
      userDailyLimit: 2,
    })

    await limiter.reserve(usageInput('request-1'))
    await limiter.reserve(usageInput('request-2'))
    await expect(limiter.reserve(usageInput('request-3'))).rejects.toThrow('AI_REMIX_DAILY_LIMIT')

    expect(repo.inspect().find(record => record.scope === 'global')).toMatchObject({ count: 2 })
  })

  it('enforces the global daily budget across users', async () => {
    const repo = createUsageRepo()
    const limiter = guardrails.createPictionaryAiUsageLimiter({
      globalDailyLimit: 2,
      now: () => Date.UTC(2026, 7, 31, 12),
      repo,
      userDailyLimit: 2,
    })

    await limiter.reserve(usageInput('request-1', 'user-1'))
    await limiter.reserve(usageInput('request-2', 'user-2'))
    await expect(limiter.reserve(usageInput('request-3', 'user-3'))).rejects.toThrow('AI_REMIX_DAILY_LIMIT')

    expect(repo.inspect().filter(record => record.scope === 'user')).toHaveLength(2)
  })

  it('is idempotent per request and resets at the UTC day boundary', async () => {
    let now = Date.UTC(2026, 7, 31, 23, 59)
    const repo = createUsageRepo()
    const limiter = guardrails.createPictionaryAiUsageLimiter({
      globalDailyLimit: 1,
      now: () => now,
      repo,
      userDailyLimit: 1,
    })

    await expect(limiter.reserve(usageInput('request-1'))).resolves.toMatchObject({ deduped: false })
    await expect(limiter.reserve(usageInput('request-1'))).resolves.toMatchObject({ deduped: true })
    now = Date.UTC(2026, 8, 1, 0, 1)
    await expect(limiter.reserve(usageInput('request-2'))).resolves.toMatchObject({ deduped: false })

    expect(repo.inspect().filter(record => record.scope === 'global')).toHaveLength(2)
  })

  it('serializes concurrent reservations at the global boundary', async () => {
    const repo = createUsageRepo()
    const limiter = guardrails.createPictionaryAiUsageLimiter({
      globalDailyLimit: 2,
      now: () => Date.UTC(2026, 7, 31, 12),
      repo,
      userDailyLimit: 3,
    })

    const results = await Promise.allSettled([
      limiter.reserve(usageInput('request-1', 'user-1')),
      limiter.reserve(usageInput('request-2', 'user-2')),
      limiter.reserve(usageInput('request-3', 'user-3')),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(repo.inspect().find(record => record.scope === 'global')).toMatchObject({ count: 2 })
  })

  it('emits only bounded, hashed audit fields', () => {
    const sink = vi.fn()
    const audit = guardrails.createPictionaryAiAudit({
      now: () => Date.UTC(2026, 7, 31, 12),
      sink,
    })

    audit.record('generation_failed', {
      answer: 'apple',
      effect: 'polish',
      error: new Error('provider secret'),
      latencyMs: 123.8,
      prompt: 'private prompt',
      reason: 'provider_failed',
      referenceImageDataUrl: 'data:image/png;base64,c2VjcmV0',
      requestId: 'request-1',
      sessionId: 'session-1',
      userId: 'user-1',
    })

    const record = sink.mock.calls[0]?.[0] as Record<string, unknown>
    expect(record).toMatchObject({
      effect: 'polish',
      event: 'generation_failed',
      latencyMs: 123,
      reason: 'provider_failed',
      timestamp: '2026-08-31T12:00:00.000Z',
    })
    expect(record.requestHash).not.toBe('request-1')
    expect(record.sessionHash).not.toBe('session-1')
    expect(record.userHash).not.toBe('user-1')
    expect(JSON.stringify(record)).not.toMatch(/apple|private prompt|provider secret|base64|request-1|session-1|user-1/)
  })

  it('validates daily budget configuration instead of silently widening it', () => {
    expect(guardrails.parseDailyLimit(undefined, 3, 'USER_LIMIT')).toBe(3)
    expect(guardrails.parseDailyLimit('0', 3, 'USER_LIMIT')).toBe(0)
    expect(() => guardrails.parseDailyLimit('-1', 3, 'USER_LIMIT')).toThrow('USER_LIMIT')
    expect(() => guardrails.parseDailyLimit('unlimited', 3, 'USER_LIMIT')).toThrow('USER_LIMIT')
    expect(() => guardrails.parseDailyLimit('1001', 3, 'USER_LIMIT')).toThrow('USER_LIMIT')
  })
})

function usageInput(requestId: string, userId = 'user-1') {
  return { requestId, sessionId: 'session-1', userId }
}

function createUsageRepo() {
  let records = new Map<string, Record<string, unknown>>()
  let transactionQueue = Promise.resolve()
  return {
    inspect: () => Array.from(records.values(), record => structuredClone(record)),
    async runActivityTransaction<T>(update: (tx: Record<string, unknown>) => Promise<T>): Promise<T> {
      let release = () => {}
      const previous = transactionQueue
      transactionQueue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const staged = new Map(Array.from(records, ([id, record]) => [id, structuredClone(record)]))
      try {
        const result = await update({
          getAiUsage: (id: string) => Promise.resolve(staged.has(id) ? structuredClone(staged.get(id)!) : undefined),
          setAiUsage: (id: string, record: Record<string, unknown>) => {
            staged.set(id, structuredClone({ ...record, id }))
            return Promise.resolve()
          },
        })
        records = staged
        return result
      }
      finally {
        release()
      }
    },
  }
}
