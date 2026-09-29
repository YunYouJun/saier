import type { Asset } from '@yunlefun/assets'
import { assetAccessSchema, assetPageSchema, assetSchema, assetUploadCreationSchema } from '@yunlefun/assets'
import { MAX_WATERMARK_BYTES, WATERMARK_IMAGE_TYPES } from './custom-asset'

export interface PrivateAssetTransport {
  invoke: (data: Record<string, unknown>) => Promise<unknown>
  assertSession: () => Promise<void>
  transfer?: typeof fetch
}

/** A session-scoped client. Callers must fence every response against account changes. */
export function createPrivateAssetClient(transport: PrivateAssetTransport, signal: AbortSignal) {
  const transfer = transport.transfer ?? fetch
  async function request(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    signal.throwIfAborted()
    await transport.assertSession()
    signal.throwIfAborted()
    const result = await transport.invoke({ action, requestId: crypto.randomUUID(), ...params }) as { ok?: boolean, data?: unknown, error?: { code?: string, message?: string } } | undefined
    signal.throwIfAborted()
    await transport.assertSession()
    if (!result?.ok)
      throw new Error(result?.error?.message ?? 'Drive 私有素材暂时不可用，请稍后重试')
    return result.data
  }
  async function digest(blob: Blob): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
  }
  async function complete(uploadId: string): Promise<Asset> {
    return assetSchema.parse(await request('complete', { uploadId }))
  }
  return {
    async list(cursor?: string, query?: string) {
      return assetPageSchema.parse(await request('list', { input: { cursor, query: query || undefined, limit: 20, status: 'ready' } }))
    },
    complete,
    async upload(file: File, onTransferred: (uploadId: string) => void): Promise<Asset> {
      if (!WATERMARK_IMAGE_TYPES.includes(file.type) || !file.size || file.size > MAX_WATERMARK_BYTES)
        throw new Error('请选择 25 MB 以内的 PNG / JPEG / WebP')
      const sha256 = await digest(file)
      const intent = assetUploadCreationSchema.parse(await request('upload', { input: { name: file.name.slice(0, 120), mimeType: file.type, sizeBytes: file.size, sha256, tags: ['saier-watermark'] } }))
      if ('deduped' in intent)
        return intent.asset
      await transport.assertSession()
      signal.throwIfAborted()
      const response = await transfer(intent.url, { method: intent.method, headers: intent.headers, body: file, credentials: 'omit', redirect: 'error', signal })
      if (!response.ok)
        throw new Error('素材上传未完成，请重试')
      signal.throwIfAborted()
      await transport.assertSession()
      // Completion is retryable without re-uploading bytes or consuming more quota.
      onTransferred(intent.uploadId)
      return complete(intent.uploadId)
    },
    async download(assetId: string): Promise<File> {
      const asset = assetSchema.parse(await request('get', { assetId }))
      if (asset.status !== 'ready' || !WATERMARK_IMAGE_TYPES.includes(asset.mimeType) || asset.sizeBytes > MAX_WATERMARK_BYTES)
        throw new Error('此素材暂不可用，请选择 25 MB 以内的 PNG / JPEG / WebP')
      const access = assetAccessSchema.parse(await request('access', { assetId }))
      await transport.assertSession()
      signal.throwIfAborted()
      if (access.action !== 'download' || access.mimeType !== asset.mimeType)
        throw new Error('素材读取凭证不匹配')
      const response = await transfer(access.url, { credentials: 'omit', redirect: 'error', signal })
      if (!response.ok || !response.body)
        throw new Error('素材读取失败，请刷新后重试')
      const reader = response.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          size += value.byteLength
          if (size > asset.sizeBytes || size > MAX_WATERMARK_BYTES)
            throw new Error('素材大小校验失败')
          chunks.push(value)
        }
      }
      finally {
        await reader.cancel()
        reader.releaseLock()
      }
      const file = new File(chunks, asset.name, { type: asset.mimeType })
      if (file.size !== asset.sizeBytes || await digest(file) !== asset.sha256)
        throw new Error('素材完整性校验失败，请重新上传')
      signal.throwIfAborted()
      await transport.assertSession()
      return file
    },
  }
}
