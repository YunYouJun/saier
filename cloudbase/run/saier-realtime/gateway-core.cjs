const { Buffer } = require('node:buffer')

const MAX_FRAME_BYTES = 64 * 1024
const MAX_PREAUTH_FRAME_BYTES = 4 * 1024
const MAX_OUTBOUND_QUEUE_BYTES = 1024 * 1024
const MAX_PREVIEW_POINTS = 32
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 768
const ACTIVITY_BRUSH_VERSION = 'saier.activity-brush.v1'
const ACTIVITY_TOOLS = new Set(['pen', 'marker', 'eraser'])
const MIN_ACTIVITY_BRUSH_SIZE = 1
const MAX_ACTIVITY_BRUSH_SIZE = 128

const TRANSPORT_TRANSITIONS = Object.freeze({
  'connecting': new Set(['realtime', 'reconnecting', 'fatal']),
  'realtime': new Set(['reconnecting', 'degraded-polling', 'fatal']),
  'reconnecting': new Set(['resyncing', 'degraded-polling', 'fatal']),
  'degraded-polling': new Set(['resyncing', 'fatal']),
  'resyncing': new Set(['recovered', 'degraded-polling', 'fatal']),
  'recovered': new Set(['realtime', 'reconnecting', 'fatal']),
  'fatal': new Set(),
})

class ConnectionQuota {
  constructor(options = {}) {
    this.maxPreAuthPerIp = options.maxPreAuthPerIp ?? 10
    this.maxConnectionsPerMinute = options.maxConnectionsPerMinute ?? 20
    this.maxAuthenticatedPerUserRoom = options.maxAuthenticatedPerUserRoom ?? 3
    this.now = options.now ?? (() => Date.now())
    this.preAuthByIp = new Map()
    this.connectionTimesByIp = new Map()
    this.authenticatedByUserRoom = new Map()
  }

  acquirePreAuth(ip) {
    const now = this.now()
    const times = (this.connectionTimesByIp.get(ip) ?? []).filter(time => now - time < 60_000)
    if (times.length >= this.maxConnectionsPerMinute)
      return false
    const current = this.preAuthByIp.get(ip) ?? 0
    if (current >= this.maxPreAuthPerIp)
      return false
    times.push(now)
    this.connectionTimesByIp.set(ip, times)
    this.preAuthByIp.set(ip, current + 1)
    return true
  }

  releasePreAuth(ip) {
    const next = Math.max(0, (this.preAuthByIp.get(ip) ?? 1) - 1)
    if (next === 0)
      this.preAuthByIp.delete(ip)
    else
      this.preAuthByIp.set(ip, next)
  }

  authenticate(ip, userId, roomId, connectionId) {
    const key = `${userId}:${roomId}`
    const ids = this.authenticatedByUserRoom.get(key) ?? new Set()
    if (ids.size >= this.maxAuthenticatedPerUserRoom)
      return false
    this.releasePreAuth(ip)
    ids.add(connectionId)
    this.authenticatedByUserRoom.set(key, ids)
    return true
  }

  releaseAuthenticated(userId, roomId, connectionId) {
    const key = `${userId}:${roomId}`
    const ids = this.authenticatedByUserRoom.get(key)
    ids?.delete(connectionId)
    if (ids?.size === 0)
      this.authenticatedByUserRoom.delete(key)
  }
}

class OutboundQueue {
  constructor(maxBytes = MAX_OUTBOUND_QUEUE_BYTES) {
    this.maxBytes = maxBytes
    this.entries = []
    this.bytes = 0
  }

  enqueue(message) {
    const encoded = typeof message.data === 'string' ? message.data : JSON.stringify(message.data)
    const bytes = Buffer.byteLength(encoded, 'utf8')
    if (message.kind === 'preview')
      this.dropWhere(entry => entry.kind === 'preview' && entry.key === message.key)
    if (message.kind === 'presence')
      this.dropWhere(entry => entry.kind === 'presence' && entry.key === message.key)
    if (bytes > this.maxBytes)
      return { accepted: false, closeForResync: message.kind === 'committed' }
    while (this.bytes + bytes > this.maxBytes) {
      const droppableIndex = this.entries.findIndex(entry => entry.kind === 'preview' || entry.kind === 'presence')
      if (droppableIndex < 0)
        return { accepted: false, closeForResync: message.kind === 'committed' || this.entries.some(entry => entry.kind === 'committed') }
      this.removeAt(droppableIndex)
    }
    this.entries.push({ ...message, bytes, data: encoded })
    this.bytes += bytes
    return { accepted: true, closeForResync: false }
  }

  shift() {
    const entry = this.entries.shift()
    if (entry)
      this.bytes -= entry.bytes
    return entry
  }

  dropWhere(predicate) {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (predicate(this.entries[index]))
        this.removeAt(index)
    }
  }

  removeAt(index) {
    const [entry] = this.entries.splice(index, 1)
    if (entry)
      this.bytes -= entry.bytes
  }
}

function validateOrigin(origin, allowedOrigins) {
  if (typeof origin !== 'string' || !origin)
    return false
  return allowedOrigins.includes(origin)
}

function parseFrame(data, authenticated) {
  const bytes = Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(String(data), 'utf8')
  const maxBytes = authenticated ? MAX_FRAME_BYTES : MAX_PREAUTH_FRAME_BYTES
  if (bytes > maxBytes)
    throw gatewayError('FRAME_TOO_LARGE', `Frame exceeds ${maxBytes} bytes.`)
  let frame
  try {
    frame = JSON.parse(String(data))
  }
  catch {
    throw gatewayError('INVALID_FRAME', 'Frame must be valid JSON.')
  }
  if (!frame || typeof frame !== 'object' || Array.isArray(frame) || typeof frame.type !== 'string')
    throw gatewayError('INVALID_FRAME', 'Frame type is required.')
  if (!authenticated && frame.type !== 'auth')
    throw gatewayError('AUTH_REQUIRED', 'The first frame must authenticate the socket.')
  return frame
}

function validatePreview(frame, authority) {
  if (frame.type !== 'preview')
    throw gatewayError('INVALID_PREVIEW', 'Expected a preview frame.')
  for (const field of ['sessionId', 'roundId', 'strokeId']) {
    if (typeof frame[field] !== 'string' || !frame[field])
      throw gatewayError('INVALID_PREVIEW', `${field} is required.`)
  }
  for (const field of ['activityEpoch', 'phaseEpoch', 'controllerEpoch', 'previewSeq']) {
    if (!Number.isSafeInteger(frame[field]) || frame[field] < 1)
      throw gatewayError('INVALID_PREVIEW', `${field} must be a positive integer.`)
  }
  if (frame.sessionId !== authority.sessionId
    || frame.activityEpoch !== authority.activityEpoch
    || frame.roundId !== authority.roundId
    || frame.phaseEpoch !== authority.phaseEpoch
    || frame.controllerEpoch !== authority.controllerEpoch
    || authority.userId !== authority.drawerId) {
    throw gatewayError('STALE_PREVIEW', 'Preview authority fence changed.')
  }
  if (!Array.isArray(frame.points) || frame.points.length < 1 || frame.points.length > MAX_PREVIEW_POINTS)
    throw gatewayError('INVALID_PREVIEW', 'Preview must contain 1-32 points.')
  for (const point of frame.points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)
      || point.x < -32 || point.x > CANVAS_WIDTH + 32
      || point.y < -32 || point.y > CANVAS_HEIGHT + 32) {
      throw gatewayError('INVALID_PREVIEW', 'Preview contains invalid coordinates.')
    }
  }
  if (!ACTIVITY_TOOLS.has(frame.tool) || frame.brushVersion !== ACTIVITY_BRUSH_VERSION)
    throw gatewayError('INVALID_PREVIEW', 'Preview tool or brush version is not allowed.')
  const defaultBaseSize = frame.tool === 'marker' ? 22 : frame.tool === 'eraser' ? 20 : 8
  const baseSize = frame.baseSize ?? defaultBaseSize
  const color = frame.color ?? '#202020'
  if (!Number.isFinite(baseSize)
    || baseSize < MIN_ACTIVITY_BRUSH_SIZE
    || baseSize > MAX_ACTIVITY_BRUSH_SIZE) {
    throw gatewayError('INVALID_PREVIEW', 'Preview baseSize is out of range.')
  }
  if (typeof color !== 'string' || !/^#[\da-f]{6}$/iu.test(color))
    throw gatewayError('INVALID_PREVIEW', 'Preview color is invalid.')
  return {
    activityEpoch: frame.activityEpoch,
    controllerEpoch: frame.controllerEpoch,
    phaseEpoch: frame.phaseEpoch,
    points: frame.points.map(point => ({ x: point.x, y: point.y, pressure: finitePressure(point.pressure) })),
    previewSeq: frame.previewSeq,
    roundId: frame.roundId,
    sessionId: frame.sessionId,
    strokeId: frame.strokeId,
    tool: frame.tool,
    baseSize,
    color: color.toLowerCase(),
    brushVersion: frame.brushVersion,
    type: 'preview',
  }
}

function transitionTransport(current, next) {
  if (!TRANSPORT_TRANSITIONS[current]?.has(next))
    throw gatewayError('INVALID_TRANSPORT_TRANSITION', `Cannot transition from ${current} to ${next}.`)
  return next
}

function projectCommittedNotification(notification, userId) {
  const publicNotification = { ...notification }
  delete publicNotification.privateAudienceUserIds
  const messages = [publicNotification]
  if (Array.isArray(notification.privateAudienceUserIds) && notification.privateAudienceUserIds.includes(userId)) {
    messages.push({
      activityEpoch: notification.activityEpoch,
      privateProjectionRevision: notification.privateProjectionRevision,
      sessionId: notification.sessionId,
      type: 'privateProjectionInvalidated',
    })
  }
  return messages
}

function finitePressure(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined
}

function gatewayError(code, message) {
  const error = new Error(code)
  error.code = code
  error.detail = message
  return error
}

module.exports = {
  ACTIVITY_BRUSH_VERSION,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ConnectionQuota,
  MAX_FRAME_BYTES,
  MAX_OUTBOUND_QUEUE_BYTES,
  MAX_PREAUTH_FRAME_BYTES,
  MAX_PREVIEW_POINTS,
  OutboundQueue,
  TRANSPORT_TRANSITIONS,
  gatewayError,
  parseFrame,
  projectCommittedNotification,
  transitionTransport,
  validateOrigin,
  validatePreview,
}
