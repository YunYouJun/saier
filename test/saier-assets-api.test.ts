import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createSaierAssetsHandler } = require('../cloudbase/functions/saier-assets-api/handler.cjs')

const requestId = 'watermark-request-01234567'

function setup(owner: string | undefined = 'alice', enabled = true) {
  const client = {
    listAssets: vi.fn(async () => ({ items: [], nextCursor: null })),
    getAsset: vi.fn(async (id: string) => ({ assetId: id })),
    createAccess: vi.fn(async () => ({ action: 'download' })),
    createUpload: vi.fn(async () => ({ uploadId: 'upload-1' })),
    completeUpload: vi.fn(async () => ({ status: 'ready' })),
  }
  const createClient = vi.fn(async (_owner: string, _requestId?: string) => client)
  const handler = createSaierAssetsHandler({ getCurrentUserId: () => owner, enabled, createClient })
  return { handler, client, createClient }
}

describe('saier private asset gateway', () => {
  it('rejects unauthenticated calls, forged owners and disabled integrations before contacting Drive', async () => {
    for (const owner of ['', 'anon']) {
      const { handler, createClient } = setup(owner)
      expect((await handler({ action: 'list', expectedUserId: 'alice', uid: 'alice' })).error.code).toBe('UNAUTHENTICATED')
      expect(createClient).not.toHaveBeenCalled()
    }
    const { handler, createClient } = setup()
    expect((await handler({ action: 'list', expectedUserId: 'bob' })).error.code).toBe('ACCOUNT_CHANGED')
    expect(createClient).not.toHaveBeenCalled()
    expect((await setup('alice', false).handler({ action: 'list', expectedUserId: 'alice' })).error.code).toBe('NOT_CONFIGURED')
  })

  it('delegates only the verified UID and enforces ownership for guessed asset IDs', async () => {
    const createClient = vi.fn(async (owner: string) => ({
      getAsset: async (id: string) => {
        if (owner !== 'alice' || id !== 'alice-image')
          throw Object.assign(new Error('private provider metadata'), { code: 'NOT_FOUND' })
        return { assetId: id }
      },
    }))
    for (const owner of ['alice', 'bob']) {
      const handler = createSaierAssetsHandler({ enabled: true, getCurrentUserId: () => owner, createClient })
      const result = await handler({ action: 'get', expectedUserId: owner, assetId: 'alice-image', uid: 'alice', headers: { 'x-drive-delegated-user-id': 'alice' } })
      expect(result.ok).toBe(owner === 'alice')
      expect(createClient).toHaveBeenLastCalledWith(owner, undefined)
    }
  })

  it('scopes mutation idempotency by owner and operation, and forces download access', async () => {
    const keys = new Set()
    for (const owner of ['alice', 'bob']) {
      const { handler, createClient, client } = setup(owner)
      for (const action of ['access', 'complete']) {
        const payload = { action, expectedUserId: owner, requestId, assetId: 'image', uploadId: 'upload', accessAction: 'public' }
        expect((await handler(payload)).ok).toBe(true)
        const first = createClient.mock.calls.at(-1)
        await handler(payload)
        expect(createClient.mock.calls.at(-1)).toEqual(first)
        keys.add(first?.[1])
      }
      expect(client.createAccess).toHaveBeenCalledWith('image', 'download')
    }
    expect(keys.size).toBe(4)
  })

  it('limits uploads and actions, and redacts sensitive provider failures', async () => {
    const { handler, client } = setup()
    for (const input of [{ mimeType: 'image/svg+xml', sizeBytes: 4 }, { mimeType: 'image/png', sizeBytes: 25_000_001 }])
      expect((await handler({ action: 'upload', requestId, expectedUserId: 'alice', input })).error.code).toBe('INVALID_REQUEST')
    expect(client.createUpload).not.toHaveBeenCalled()
    expect((await handler({ action: 'purge', expectedUserId: 'alice' })).error.code).toBe('INVALID_REQUEST')
    client.listAssets.mockRejectedValueOnce(new Error('Bearer secret credential'))
    const result = await handler({ action: 'list', expectedUserId: 'alice' })
    expect(result.error.code).toBe('UPSTREAM_UNAVAILABLE')
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
