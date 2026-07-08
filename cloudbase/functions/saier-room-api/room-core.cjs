const crypto = require('node:crypto')

function createRoomError(reason, message) {
  const error = new Error(reason)
  error.reason = reason
  error.code = reason
  error.detail = message
  return error
}

function requireString(value, name) {
  const parsed = stringValue(value)
  if (!parsed)
    throw createRoomError('backend_unavailable', `Missing ${name}.`)
  return parsed
}

function requireInteger(value, name) {
  const parsed = integerValue(value)
  if (parsed === undefined)
    throw createRoomError('backend_unavailable', `Invalid ${name}.`)
  return parsed
}

function createRoomShareUrl(origin, roomId, inviteToken) {
  if (!origin)
    return undefined

  const url = new URL(origin)
  url.pathname = '/'
  url.hash = ''
  url.search = ''
  url.searchParams.set('room', roomId)
  if (inviteToken)
    url.searchParams.set('invite', inviteToken)
  return url.toString()
}

function createRoomRandomId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function integerValue(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function positiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function objectValue(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

module.exports = {
  createRoomError,
  createRoomRandomId,
  createRoomShareUrl,
  integerValue,
  objectValue,
  positiveInteger,
  requireInteger,
  requireString,
  sha256,
  stringValue,
}
