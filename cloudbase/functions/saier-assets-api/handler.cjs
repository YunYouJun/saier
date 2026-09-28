const { createHash } = require('node:crypto')

const messages = {
  UNAUTHENTICATED: '请先登录云乐坊账号',
  ACCOUNT_CHANGED: '账号已切换，请重新操作',
  NOT_CONFIGURED: 'Drive 私有素材连接尚未启用',
  FORBIDDEN: '当前账号尚未获准访问此素材库',
  NOT_FOUND: '素材不存在或不可访问',
  QUOTA_EXCEEDED: '云乐坊共享存储空间不足',
  INVALID_REQUEST: '素材请求无效',
  IDEMPOTENCY_CONFLICT: '上传请求发生冲突，请刷新后重试',
  ASSET_NOT_READY: '素材仍在处理，请稍后刷新',
  UPSTREAM_UNAVAILABLE: 'Drive 素材服务暂时不可用',
}

/** Narrow Drive proxy. Ownership comes only from the authenticated function context. */
function createSaierAssetsHandler({ getCurrentUserId, createClient, enabled }) {
  return async (event = {}) => {
    try {
      const userId = await getCurrentUserId()
      if (!userId || userId === 'anon')
        return failure('UNAUTHENTICATED')
      if (event.expectedUserId !== userId)
        return failure('ACCOUNT_CHANGED')
      if (!enabled)
        return failure('NOT_CONFIGURED')
      if (!['list', 'get', 'access', 'upload', 'complete'].includes(event.action))
        return failure('INVALID_REQUEST')
      const mutation = ['access', 'upload', 'complete'].includes(event.action)
      if (mutation && (typeof event.requestId !== 'string' || !/^[\w-]{16,80}$/.test(event.requestId)))
        return failure('INVALID_REQUEST')
      // Scope idempotency to the authenticated actor; callers cannot collide across accounts.
      const requestId = mutation ? createHash('sha256').update(`${userId}:${event.action}:${event.requestId}`).digest('hex') : undefined
      const client = await createClient(userId, requestId)
      let data
      switch (event.action) {
        case 'list':
          data = await client.listAssets(event.input)
          break
        case 'get':
          data = await client.getAsset(event.assetId)
          break
        case 'access':
          data = await client.createAccess(event.assetId, 'download')
          break
        case 'upload':
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(event.input?.mimeType)
            || !Number.isSafeInteger(event.input?.sizeBytes) || event.input.sizeBytes <= 0 || event.input.sizeBytes > 25_000_000) {
            return failure('INVALID_REQUEST')
          }
          data = await client.createUpload(event.input)
          break
        case 'complete':
          data = await client.completeUpload(event.uploadId)
          break
      }
      return { ok: true, data }
    }
    catch (error) {
      // Never return provider payloads, token-bearing headers or SDK diagnostic errors.
      if (error?.name === 'ZodError')
        return failure('INVALID_REQUEST')
      return failure(Object.hasOwn(messages, error?.code) ? error.code : 'UPSTREAM_UNAVAILABLE')
    }
  }
}

function failure(code) {
  return { ok: false, error: { code, message: messages[code] } }
}

module.exports = { createSaierAssetsHandler }
