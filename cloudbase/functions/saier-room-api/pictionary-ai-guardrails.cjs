const { activityError } = require('./activity-core.cjs')
const { sha256 } = require('./room-core.cjs')

const DAY_MS = 24 * 60 * 60 * 1000
const USAGE_RETENTION_MS = 7 * DAY_MS
const MAX_DAILY_LIMIT = 1000
const AUDIT_EVENTS = new Set([
  'generation_completed',
  'generation_failed',
  'generation_started',
  'quota_rejected',
  'quota_reserved',
])
const AUDIT_REASONS = new Set([
  'authority_apply_failed',
  'provider_failed',
  'quota_global',
  'quota_unavailable',
  'quota_user',
])
const AUDIT_EFFECTS = new Set(['polish', 'surprise', 'texture'])
const AUDIT_OUTCOMES = new Set(['applied', 'bonus'])
const AUDIT_QUOTA_SCOPES = new Set(['global', 'user'])

function createPictionaryAiUsageLimiter(options) {
  if (typeof options?.repo?.runActivityTransaction !== 'function')
    throw new TypeError('Pictionary AI usage requires a transactional repository.')

  const globalDailyLimit = nonNegativeInteger(options.globalDailyLimit, 'globalDailyLimit')
  const userDailyLimit = nonNegativeInteger(options.userDailyLimit, 'userDailyLimit')
  const now = typeof options.now === 'function' ? options.now : Date.now

  return {
    async reserve(input) {
      const timestamp = finiteTimestamp(now())
      const day = new Date(timestamp).toISOString().slice(0, 10)
      const requestId = requiredString(input.requestId, 'requestId')
      const sessionId = requiredString(input.sessionId, 'sessionId')
      const userId = requiredString(input.userId, 'userId')
      const requestHash = sha256(`${sessionId}\0${userId}\0${requestId}`)
      const userHash = sha256(userId)
      const globalId = usageDocumentId(day, 'global')
      const userUsageId = usageDocumentId(day, `user:${userHash}`)

      return options.repo.runActivityTransaction(async (tx) => {
        if (typeof tx.getAiUsage !== 'function' || typeof tx.setAiUsage !== 'function')
          throw new TypeError('Pictionary AI usage transaction methods are unavailable.')

        const globalUsage = normalizeUsage(await tx.getAiUsage(globalId), day, 'global')
        const userUsage = normalizeUsage(await tx.getAiUsage(userUsageId), day, 'user')
        const globalDeduped = globalUsage.requestHashes.includes(requestHash)
        const userDeduped = userUsage.requestHashes.includes(requestHash)
        if (globalDeduped !== userDeduped)
          throw activityError('AI_REMIX_QUOTA_UNAVAILABLE', 'AI remix usage counters are inconsistent.')
        if (globalDeduped) {
          return usageResult({
            deduped: true,
            globalCount: globalUsage.count,
            globalDailyLimit,
            userCount: userUsage.count,
            userDailyLimit,
          })
        }

        if (userUsage.count >= userDailyLimit)
          throw dailyLimitError('user')
        if (globalUsage.count >= globalDailyLimit)
          throw dailyLimitError('global')

        const deleteAfter = Date.parse(`${day}T00:00:00.000Z`) + DAY_MS + USAGE_RETENTION_MS
        await tx.setAiUsage(globalId, nextUsageDocument(globalUsage, {
          day,
          deleteAfter,
          requestHash,
          scope: 'global',
          timestamp,
        }))
        await tx.setAiUsage(userUsageId, nextUsageDocument(userUsage, {
          day,
          deleteAfter,
          requestHash,
          scope: 'user',
          timestamp,
          userHash,
        }))

        return usageResult({
          deduped: false,
          globalCount: globalUsage.count + 1,
          globalDailyLimit,
          userCount: userUsage.count + 1,
          userDailyLimit,
        })
      })
    },
  }
}

function createPictionaryAiAudit(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now
  const sink = typeof options.sink === 'function' ? options.sink : () => {}

  return {
    record(event, input = {}) {
      if (!AUDIT_EVENTS.has(event))
        return
      const record = {
        component: 'pictionary-ai-remix',
        event,
        timestamp: new Date(finiteTimestamp(now())).toISOString(),
      }
      addIdentifierHash(record, 'requestHash', input.requestId)
      addIdentifierHash(record, 'sessionHash', input.sessionId)
      addIdentifierHash(record, 'userHash', input.userId)
      addEnum(record, 'effect', input.effect, AUDIT_EFFECTS)
      addEnum(record, 'outcome', input.outcome, AUDIT_OUTCOMES)
      addEnum(record, 'quotaScope', input.quotaScope, AUDIT_QUOTA_SCOPES)
      addEnum(record, 'reason', input.reason, AUDIT_REASONS)
      addNonNegativeInteger(record, 'latencyMs', input.latencyMs)
      addNonNegativeInteger(record, 'globalCount', input.globalCount)
      addNonNegativeInteger(record, 'globalLimit', input.globalLimit)
      addNonNegativeInteger(record, 'userCount', input.userCount)
      addNonNegativeInteger(record, 'userLimit', input.userLimit)
      try {
        sink(record)
      }
      catch {
        // Observability must never change gameplay or quota behavior.
      }
    },
  }
}

function parseDailyLimit(value, fallback, name) {
  if (value === undefined || value === '')
    return nonNegativeInteger(fallback, name)
  if (!/^\d+$/u.test(value))
    throw new TypeError(`${name} must be a non-negative integer.`)
  return nonNegativeInteger(Number(value), name)
}

function nextUsageDocument(current, input) {
  return {
    count: current.count + 1,
    createdAt: current.createdAt ?? input.timestamp,
    day: input.day,
    deleteAfter: input.deleteAfter,
    requestHashes: [...current.requestHashes, input.requestHash],
    scope: input.scope,
    updatedAt: input.timestamp,
    userHash: input.userHash,
    version: 1,
  }
}

function normalizeUsage(value, day, scope) {
  if (value === undefined)
    return { count: 0, requestHashes: [] }
  if (value?.version !== 1 || value?.day !== day || value?.scope !== scope || !Number.isSafeInteger(value?.count) || value.count < 0)
    throw activityError('AI_REMIX_QUOTA_UNAVAILABLE', 'AI remix usage counter is invalid.')
  if (!Array.isArray(value.requestHashes) || value.requestHashes.length !== value.count || value.requestHashes.some(item => typeof item !== 'string'))
    throw activityError('AI_REMIX_QUOTA_UNAVAILABLE', 'AI remix usage requests are invalid.')
  return {
    count: value.count,
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : undefined,
    requestHashes: value.requestHashes,
  }
}

function usageResult(input) {
  return {
    deduped: input.deduped,
    globalCount: input.globalCount,
    globalLimit: input.globalDailyLimit,
    userCount: input.userCount,
    userLimit: input.userDailyLimit,
  }
}

function dailyLimitError(scope) {
  return Object.assign(
    activityError('AI_REMIX_DAILY_LIMIT', 'AI remix daily capacity has been reached. Try again tomorrow.'),
    { quotaScope: scope },
  )
}

function usageDocumentId(day, scope) {
  return `sau_${sha256(`${day}:${scope}`).slice(0, 40)}`
}

function addIdentifierHash(record, key, value) {
  if (typeof value === 'string' && value)
    record[key] = sha256(value).slice(0, 16)
}

function addEnum(record, key, value, allowed) {
  if (allowed.has(value))
    record[key] = value
}

function addNonNegativeInteger(record, key, value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
    record[key] = Math.floor(value)
}

function finiteTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError('Pictionary AI clock must return a finite timestamp.')
  return value
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DAILY_LIMIT)
    throw new TypeError(`${name} must be an integer from 0 to ${MAX_DAILY_LIMIT}.`)
  return value
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${name} is required.`)
  return value.trim()
}

module.exports = {
  createPictionaryAiAudit,
  createPictionaryAiUsageLimiter,
  parseDailyLimit,
}
