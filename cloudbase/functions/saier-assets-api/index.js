const process = require('node:process')
const cloudbase = require('@cloudbase/node-sdk')
const { createSaierAssetsHandler } = require('./handler.cjs')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const contracts = import('@yunlefun/assets')
const token = process.env.SAIER_DRIVE_CONSUMER_TOKEN

exports.main = createSaierAssetsHandler({
  enabled: process.env.SAIER_DRIVE_LIBRARY_ENABLED === 'true' && Boolean(token),
  getCurrentUserId() {
    // Event functions use CloudBase gateway identity, never event.uid or a delegated browser header.
    const info = app.auth().getUserInfo()
    if (info?.isAnonymous || info?.is_anonymous || info?.userType === 'ANONYMOUS')
      return undefined
    return info?.uid
  },
  async createClient(userId, requestId) {
    const { createAssetClient } = await contracts
    return createAssetClient({
      baseUrl: 'https://drive.yunle.fun/api/v1/library',
      credentials: 'omit',
      fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) }),
      headers: {
        'authorization': `Bearer ${token}`,
        'x-drive-delegated-user-id': userId,
        ...(requestId ? { 'idempotency-key': requestId } : {}),
      },
    })
  },
})
