import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createPlayPictionaryTicketService } = require('../cloudbase/functions/saier-room-api/play-pictionary-ticket.cjs') as {
  createPlayPictionaryTicketService: (options: Record<string, unknown>) => {
    configured: boolean
    issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

describe('saier Play Pictionary ticket client', () => {
  it('keeps the service credential in the server request and returns browser-safe room data', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      expiresAt: '2026-08-05T12:00:00.000Z',
      roomType: 'pictionary_room',
      sessionId: 'session-1234',
      ticket: 'one-time-ticket',
    }), {
      headers: { 'content-type': 'application/json' },
      status: 201,
    }))
    const service = createPlayPictionaryTicketService({
      apiBaseUrl: 'https://api.play.yunle.fun',
      fetchImpl,
      token: 's'.repeat(48),
    })

    const result = await service.issue({
      publicState: { sessionId: 'session-1234' },
      secretState: { selectedAnswer: 'apple' },
      user: { displayName: 'Saier User', userId: 'user-1' },
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://api.play.yunle.fun/v1/pictionary/session-tickets'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'authorization': `Bearer ${'s'.repeat(48)}`,
          'x-yunlefun-app-id': 'saier',
        }),
      }),
    )
    expect(result).toMatchObject({
      realtimeUrl: 'wss://api.play.yunle.fun/',
      roomType: 'pictionary_room',
      sessionId: 'session-1234',
      ticket: 'one-time-ticket',
    })
    expect(JSON.stringify(result)).not.toContain('ssssssss')
  })

  it('fails closed when the issuer is not configured', async () => {
    const service = createPlayPictionaryTicketService({})
    expect(service.configured).toBe(false)
    await expect(service.issue({})).rejects.toMatchObject({ code: 'backend_unavailable' })
  })
})
