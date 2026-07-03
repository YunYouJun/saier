import { describe, expect, it } from 'vitest'
import {
  isYunlefunQuotaExceededMessage,
  isYunlefunStorageUnavailableMessage,
  normalizeYunlefunCloudErrorMessage,
} from '../site/app/utils/yunlefunCloudErrors'

function cloudbaseFunctionError(message: string): Error {
  return new Error(JSON.stringify({
    code: 'OPERATION_FAIL',
    msg: `[FUNCTIONS_EXECUTE_FAIL] Error: ${message}
    at dispatch (/var/user/index.js:249:13)
    at exports.main (/var/user/index.js:276:26) 更多错误信息请访问：https://docs.cloudbase.net/error-code/basic/FUNCTIONS_EXECUTE_FAIL`,
  }))
}

describe('yunlefun cloud error helpers', () => {
  it('keeps transient quota sync conflicts out of quota-exceeded errors', () => {
    const message = normalizeYunlefunCloudErrorMessage(
      cloudbaseFunctionError('同步云空间配额并发冲突，请重试'),
    )

    expect(message).toBe('同步云空间配额并发冲突，请重试')
    expect(isYunlefunQuotaExceededMessage(message)).toBe(false)
    expect(isYunlefunStorageUnavailableMessage(message)).toBe(false)
  })

  it('keeps missing storage API actions as backend errors, not storage errors', () => {
    const message = normalizeYunlefunCloudErrorMessage(
      cloudbaseFunctionError('未知 action: listStorageFiles'),
    )

    expect(message).toBe('未知 action: listStorageFiles')
    expect(isYunlefunQuotaExceededMessage(message)).toBe(false)
    expect(isYunlefunStorageUnavailableMessage(message)).toBe(false)
  })

  it('still recognizes real quota and storage failures', () => {
    expect(isYunlefunQuotaExceededMessage('配额不足，无法上传')).toBe(true)
    expect(isYunlefunQuotaExceededMessage('quota exceeded')).toBe(true)

    expect(isYunlefunStorageUnavailableMessage('CloudBase storage security domain is not configured')).toBe(true)
    expect(isYunlefunStorageUnavailableMessage('uploadFile failed')).toBe(true)
    expect(isYunlefunStorageUnavailableMessage('STORAGE_EXCEED_AUTHORITY: Have no access right to the storage')).toBe(true)
  })
})
