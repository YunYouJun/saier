export function normalizeYunlefunCloudErrorMessage(error: unknown): string {
  const raw = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : ''
  if (!raw)
    return ''

  return cleanupCloudbaseErrorMessage(readCloudbasePayloadMessage(raw) ?? raw)
}

export function isYunlefunQuotaExceededMessage(message: string): boolean {
  return /容量不足|空间不足|配额不足|超出.*配额|配额.*不足|quota[_\s-]*(?:exceeded|exceed|insufficient)|insufficient.*quota|quota.*exceed/i.test(message)
}

export function isYunlefunStorageUnavailableMessage(message: string): boolean {
  return /storage_unavailable|cloud storage|storage security|storage.*authority|Have no access right to the storage|security domain|uploadFile|getTempFileURL|deleteFile|fileid|文件上传|文件下载|存储.*(?:不可用|失败)/i.test(message)
}

function readCloudbasePayloadMessage(message: string): string | undefined {
  const trimmed = message.trim()
  if (!trimmed.startsWith('{'))
    return undefined

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isRecord(parsed))
      return undefined

    const value = parsed.msg ?? parsed.message
    return typeof value === 'string' ? value : undefined
  }
  catch {
    return undefined
  }
}

function cleanupCloudbaseErrorMessage(message: string): string {
  return message
    .replace(/^\[FUNCTIONS_EXECUTE_FAIL\]\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/\n[\s\S]*$/u, '')
    .replace(/\s*更多错误信息请访问：https?:\/\/\S+$/u, '')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
