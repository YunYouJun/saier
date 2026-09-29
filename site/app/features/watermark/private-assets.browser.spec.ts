import type { PrivateAssetTransport } from './private-assets'
import { afterEach, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { readCustomWatermark } from './custom-asset'
import { createPrivateAssetClient } from './private-assets'
import { usePrivateWatermarks } from './usePrivateWatermarks'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()))
const bytes = new Uint8Array([1, 2, 3])
async function asset() {
  return { assetId: 'private-asset', createdAt: '2026-09-28T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z', name: '水印.png', mimeType: 'image/png', width: 2, height: 2, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''), sizeBytes: 3, sourceAppId: 'saier', status: 'ready', tags: [], trashedAt: null, preview: null }
}
function client(invoke: PrivateAssetTransport['invoke'], transfer = vi.fn<typeof fetch>()) {
  return createPrivateAssetClient({ invoke, transfer, assertSession: async () => {} }, new AbortController().signal)
}
const access = { action: 'download', mimeType: 'image/png', expiresAt: '2099-09-28T00:00:00Z', url: 'https://storage.example/private-object?signature=secret' }

it('downloads privately, validates original bytes and never includes cookies', async () => {
  const item = await asset()
  const invoke = vi.fn(async ({ action }) => ({ ok: true, data: action === 'get' ? item : access }))
  const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes))
  const file = await client(invoke, transfer).download(item.assetId)
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
  expect(transfer).toHaveBeenCalledWith(access.url, expect.objectContaining({ credentials: 'omit', redirect: 'error' }))
  transfer.mockResolvedValueOnce(new Response(new Uint8Array([9, 9, 9])))
  await expect(client(invoke, transfer).download(item.assetId)).rejects.toThrow('完整性')
  transfer.mockResolvedValueOnce(new Response(new Uint8Array(4)))
  await expect(client(invoke, transfer).download(item.assetId)).rejects.toThrow('大小')
})

it('deduplicates uploads and retries completion without a second PUT', async () => {
  const item = await asset()
  const transfer = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
  const file = new File([bytes], 'test.png', { type: 'image/png' })
  const complete = vi.fn()
  await client(async () => ({ ok: true, data: { asset: item, deduped: true } }), transfer).upload(file, complete)
  expect(transfer).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
  let completionAttempts = 0
  const invoke = vi.fn(async ({ action }) => {
    if (action === 'upload')
      return { ok: true, data: { assetId: item.assetId, uploadId: 'private-upload', url: access.url, headers: { 'content-type': 'image/png' }, expiresAt: access.expiresAt, method: 'PUT' } }
    if (++completionAttempts === 1)
      return { ok: false, error: { message: '处理中' } }
    return { ok: true, data: item }
  })
  const api = client(invoke, transfer)
  await expect(api.upload(file, complete)).rejects.toThrow('处理中')
  expect(complete).toHaveBeenCalledWith('private-upload')
  expect((await api.complete('private-upload')).status).toBe('ready')
  expect(transfer).toHaveBeenCalledTimes(1)
  expect(transfer).toHaveBeenCalledWith(access.url, expect.objectContaining({ method: 'PUT', credentials: 'omit', headers: { 'content-type': 'image/png' } }))
})

it('clears account data synchronously and discards an old account response', async () => {
  const item = await asset()
  const owner = ref<string | undefined>('alice')
  let release!: (result: unknown) => void
  const invoke = vi.fn((_data: Record<string, unknown>) => new Promise<unknown>((resolve) => {
    release = resolve
  }))
  const scope = effectScope()
  scopes.push(scope)
  const library = scope.run(() => usePrivateWatermarks({ userId: owner, ensureSession: async () => {}, invoke }))!
  const loading = library.refresh()
  await vi.waitFor(() => expect(invoke).toHaveBeenCalled())
  expect(invoke.mock.calls[0]?.[0]).toMatchObject({ expectedUserId: 'alice' })
  owner.value = 'bob'
  expect(library.items.value).toEqual([])
  expect(library.busy.value).toBe(false)
  release({ ok: true, data: { items: [item], nextCursor: null } })
  await loading
  expect(library.items.value).toEqual([])
  expect(library.error.value).toBe('')
  const second = library.refresh()
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  release({ ok: true, data: { items: [item], nextCursor: null } })
  await second
  expect(library.items.value).toHaveLength(1)
  owner.value = undefined
  expect(library.items.value).toEqual([])
  await library.refresh()
  expect(invoke).toHaveBeenCalledTimes(2)
})

it('keeps non-terminal empty pages pageable and blocks expired sessions', async () => {
  const owner = ref<string | undefined>('alice')
  const invoke = vi.fn(async (_data: Record<string, unknown>) => ({ ok: true, data: { items: [], nextCursor: 'continue-opaque' } }))
  const scope = effectScope()
  scopes.push(scope)
  const ensureSession = vi.fn(async () => {})
  const library = scope.run(() => usePrivateWatermarks({ userId: owner, ensureSession, invoke }))!
  await library.refresh()
  expect(library.nextCursor.value).toBe('continue-opaque')
  await library.refresh('', true)
  expect(invoke.mock.calls.at(-1)?.[0]).toMatchObject({ input: { cursor: 'continue-opaque' } })
  ensureSession.mockRejectedValue(new Error('会话已过期'))
  await library.refresh()
  expect(invoke).toHaveBeenCalledTimes(2)
  expect(library.error.value).toBe('会话已过期')
})

it('imports transparent raster materials into portable PNGs and rejects unsupported or excessive files', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 20
  canvas.height = 10
  canvas.getContext('2d')!.fillRect(0, 0, 10, 5)
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/webp'))
  const item = await readCustomWatermark(new File([blob], 'custom.webp', { type: 'image/webp' }), 'heart-signature', true)
  expect(item).toMatchObject({ role: 'heart-signature', recolorable: true, width: 20, height: 10, blendMode: 'normal' })
  const texture = await readCustomWatermark(new File([blob], 'texture.webp', { type: 'image/webp' }), 'micro-texture', false)
  expect(texture.blendMode).toBe('overlay')
  expect(item.source).toMatch(/^data:image\/png;base64,/)
  expect(item.image.getContext('2d')!.getImageData(19, 9, 1, 1).data[3]).toBe(0)
  await expect(readCustomWatermark(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }), 'small-seal', true)).rejects.toThrow('PNG / JPEG / WebP')
  await expect(readCustomWatermark(new File([blob], 'full.webp', { type: 'image/webp' }), 'small-seal', true, { name: 'full', rules: '', assets: Array.from({ length: 12 }, (_, index) => ({ ...item, id: String(index) })) })).rejects.toThrow('12')
})
