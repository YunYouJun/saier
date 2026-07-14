const crypto = require('node:crypto')
const http = require('node:http')
const process = require('node:process')
const cloudbase = require('@cloudbase/node-sdk')
const { createClient } = require('redis')
const { WebSocket, WebSocketServer } = require('ws')
const { createActivityCommandService } = require('./authority/activity-command-service.cjs')
const { createActivityDeadlineWorker, createActivityOutboxPublisher } = require('./authority/activity-workers.cjs')
const { createCloudbaseCollectionStore } = require('./authority/cloudbase-runtime.cjs')
const {
  ConnectionQuota,
  MAX_OUTBOUND_QUEUE_BYTES,
  OutboundQueue,
  gatewayError,
  parseFrame,
  projectCommittedNotification,
  validateOrigin,
  validatePreview,
} = require('./gateway-core.cjs')

const PORT = Number(process.env.PORT ?? 8080)
const ENV_ID = process.env.TCB_ENV_ID ?? process.env.CLOUDBASE_ENV_ID
const ALLOWED_ORIGINS = String(process.env.SAIER_REALTIME_ALLOWED_ORIGINS ?? 'https://saier.yunle.fun')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)
const COLLECTIONS = {
  activityCanvasOperations: 'saier_room_game_canvas_operations',
  activityCommands: 'saier_room_game_commands',
  activityEvents: 'saier_room_game_events',
  activityOutbox: 'saier_room_game_outbox',
  activitySecrets: 'saier_room_game_secrets',
  activitySessions: 'saier_room_game_sessions',
  activitySnapshots: 'saier_room_game_snapshots',
  members: 'saier_room_members',
  operations: 'saier_room_operations',
  reservations: 'saier_room_snapshot_reservations',
  rooms: 'saier_room_rooms',
  snapshots: 'saier_room_snapshots',
}

if (!ENV_ID)
  throw new Error('TCB_ENV_ID or CLOUDBASE_ENV_ID is required.')
if (!process.env.SAIER_REALTIME_TOKEN_SECRET)
  throw new Error('SAIER_REALTIME_TOKEN_SECRET is required.')

const app = cloudbase.init({ env: ENV_ID })
const database = app.database()
const repo = createCloudbaseCollectionStore(database, COLLECTIONS)
const commandService = createActivityCommandService({ repo })
const connections = new Map()
const quota = new ConnectionQuota()
const tokenSecret = new TextEncoder().encode(process.env.SAIER_REALTIME_TOKEN_SECRET)
const redis = createClient({ url: process.env.REDIS_URL })
const redisSubscriber = redis.duplicate()
let ready = false
let draining = false

const outboxPublisher = createActivityOutboxPublisher({
  now: () => Date.now(),
  publish: notification => redis.publish('saier:activity:committed', JSON.stringify(notification)),
  repo,
})
const deadlineWorker = createActivityDeadlineWorker({
  commandService,
  deadlineIndex: {
    add: item => redis.zAdd('saier:activity:deadlines', [{ score: item.deadlineAt, value: JSON.stringify(item) }]),
  },
  repo,
})

const server = http.createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200).end('ok')
    return
  }
  if (request.url === '/readyz') {
    response.writeHead(ready && !draining ? 200 : 503).end(ready && !draining ? 'ready' : 'not-ready')
    return
  }
  response.writeHead(404).end('not found')
})

const websocketServer = new WebSocketServer({
  maxPayload: 64 * 1024,
  noServer: true,
  perMessageDeflate: false,
})

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin
  const ip = clientIp(request)
  if (draining || !validateOrigin(origin, ALLOWED_ORIGINS) || !quota.acquirePreAuth(ip)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  websocketServer.handleUpgrade(request, socket, head, (websocket) => {
    websocketServer.emit('connection', websocket, request, { ip, origin })
  })
})

websocketServer.on('connection', (websocket, _request, connectionInfo) => {
  const connection = {
    authenticated: false,
    connectionId: crypto.randomUUID(),
    ip: connectionInfo.ip,
    lastPongAt: Date.now(),
    missedPongs: 0,
    outbound: new OutboundQueue(),
    previewTokens: 20,
    previewUpdatedAt: Date.now(),
    websocket,
  }
  connections.set(connection.connectionId, connection)

  const preAuthTimer = setTimeout(() => {
    if (!connection.authenticated)
      closeConnection(connection, 4401, 'auth-timeout')
  }, 5000)

  websocket.on('pong', () => {
    connection.lastPongAt = Date.now()
    connection.missedPongs = 0
  })
  websocket.on('message', async (data) => {
    try {
      const frame = parseFrame(data, connection.authenticated)
      await handleFrame(connection, frame)
    }
    catch (error) {
      sendMessage(connection, 'committed', {
        type: 'error',
        code: error?.code ?? 'INTERNAL_ERROR',
      })
      if (!connection.authenticated || ['AUTH_REQUIRED', 'FRAME_TOO_LARGE'].includes(error?.code))
        closeConnection(connection, 4400, error?.code ?? 'invalid-frame')
    }
  })
  websocket.on('close', () => {
    clearTimeout(preAuthTimer)
    releaseConnection(connection)
  })
  websocket.on('error', () => releaseConnection(connection))
})

async function handleFrame(connection, frame) {
  if (frame.type === 'auth' || frame.type === 'reauth') {
    await authenticateConnection(connection, frame)
    return
  }
  if (!connection.authenticated)
    throw gatewayError('AUTH_REQUIRED', 'Socket is not authenticated.')
  if (frame.type === 'command') {
    const command = {
      ...frame.command,
      payload: ['commitStroke', 'takeController'].includes(frame.command?.type)
        ? { ...frame.command.payload, connectionId: connection.connectionId }
        : frame.command?.payload,
    }
    assertConnectionFence(connection, command)
    const result = await commandService.submitCommand(command, connection.userId)
    sendMessage(connection, 'committed', { requestId: frame.requestId, result, type: 'commandResult' })
    return
  }
  if (frame.type === 'resume') {
    const result = await commandService.resumeActivity({
      activityEpoch: connection.activityEpoch,
      cursor: frame.cursor,
      sessionId: connection.sessionId,
    }, connection.userId)
    sendMessage(connection, 'committed', { requestId: frame.requestId, result, type: 'resumeResult' })
    return
  }
  if (frame.type === 'preview') {
    consumePreviewToken(connection)
    const session = await repo.getActivitySession(connection.sessionId)
    if (session?.activeControllerConnectionId !== connection.connectionId)
      throw gatewayError('STALE_PREVIEW', 'Another drawer connection owns the controller.')
    const preview = validatePreview(frame, {
      activityEpoch: session?.activityEpoch,
      controllerEpoch: session?.controllerEpoch,
      drawerId: session?.round?.drawerId,
      phaseEpoch: session?.phaseEpoch,
      roundId: session?.round?.roundId,
      sessionId: session?.sessionId,
      userId: connection.userId,
    })
    await redis.publish('saier:activity:preview', JSON.stringify({ ...preview, userId: connection.userId }))
    return
  }
  if (frame.type === 'pong') {
    connection.lastPongAt = Date.now()
    connection.missedPongs = 0
    return
  }
  throw gatewayError('INVALID_FRAME', 'Unsupported frame type.')
}

async function authenticateConnection(connection, frame) {
  const token = typeof frame.token === 'string' ? frame.token : ''
  if (!token || token.length > 4096)
    throw gatewayError('INVALID_TOKEN', 'Realtime token is required.')
  const { jwtVerify } = await import('jose')
  const verified = await jwtVerify(token, tokenSecret, {
    audience: 'saier-realtime',
    clockTolerance: 5,
  })
  const claims = verified.payload
  for (const claim of ['sub', 'envId', 'roomId', 'jti']) {
    if (typeof claims[claim] !== 'string' || !claims[claim])
      throw gatewayError('INVALID_TOKEN', `Missing ${claim} claim.`)
  }
  if (claims.envId !== ENV_ID)
    throw gatewayError('INVALID_TOKEN', 'Token environment mismatch.')
  const [room, member] = await Promise.all([
    repo.getRoom(claims.roomId),
    repo.getMemberByRoomAndUser(claims.roomId, claims.sub),
  ])
  if (!room || !member)
    throw gatewayError('MEMBERSHIP_REVOKED', 'Room membership is no longer active.')
  if (typeof claims.sessionId === 'string') {
    const session = await repo.getActivitySession(claims.sessionId)
    if (!session
      || session.status === 'finished'
      || room.activeActivity?.sessionId !== claims.sessionId
      || room.activeActivity?.activityEpoch !== Number(claims.activityEpoch)) {
      throw gatewayError('SESSION_ENDED', 'Activity session is no longer active.')
    }
  }
  if (connection.authenticated) {
    if (claims.sub !== connection.userId || claims.roomId !== connection.roomId)
      throw gatewayError('INVALID_TOKEN', 'Re-auth identity changed.')
  }
  else {
    const distributedConnectionKey = `saier:connections:${claims.roomId}:${claims.sub}`
    if (!await acquireDistributedConnection(distributedConnectionKey, connection.connectionId))
      throw gatewayError('CONNECTION_LIMIT', 'Authenticated connection limit exceeded.')
    if (!quota.authenticate(connection.ip, claims.sub, claims.roomId, connection.connectionId)) {
      await redis.sRem(distributedConnectionKey, connection.connectionId)
      throw gatewayError('CONNECTION_LIMIT', 'Authenticated connection limit exceeded.')
    }
    connection.authenticated = true
    connection.distributedConnectionKey = distributedConnectionKey
    connection.userId = claims.sub
    connection.roomId = claims.roomId
  }
  connection.activityEpoch = Number(claims.activityEpoch ?? frame.activityEpoch)
  connection.sessionId = typeof claims.sessionId === 'string' ? claims.sessionId : frame.sessionId
  connection.expiresAt = Number(claims.exp) * 1000
  connection.reauthRequested = false
  await registerAuthenticatedConnection(connection)
  sendMessage(connection, 'committed', {
    connectionId: connection.connectionId,
    expiresAt: connection.expiresAt,
    type: 'authenticated',
  })
}

function sendMessage(connection, kind, value, key) {
  if (connection.websocket.readyState !== WebSocket.OPEN)
    return false
  const data = JSON.stringify(value)
  if (connection.websocket.bufferedAmount === 0 && connection.outbound.entries.length === 0) {
    connection.websocket.send(data)
    return true
  }
  const queued = connection.outbound.enqueue({ data, key, kind })
  if (queued.closeForResync)
    closeConnection(connection, 4409, 'resync-required')
  return queued.accepted
}

function flushOutbound(connection) {
  if (connection.websocket.readyState !== WebSocket.OPEN || connection.websocket.bufferedAmount > MAX_OUTBOUND_QUEUE_BYTES / 4)
    return
  while (connection.websocket.bufferedAmount < MAX_OUTBOUND_QUEUE_BYTES / 4) {
    const entry = connection.outbound.shift()
    if (!entry)
      break
    connection.websocket.send(entry.data)
  }
}

function broadcast(notification, kind) {
  for (const connection of connections.values()) {
    if (!connection.authenticated || connection.sessionId !== notification.sessionId)
      continue
    const messages = kind === 'committed'
      ? projectCommittedNotification(notification, connection.userId)
      : [notification]
    for (const message of messages)
      sendMessage(connection, kind, message, notification.strokeId ?? notification.sessionId)
  }
}

function assertConnectionFence(connection, command) {
  if (command?.sessionId !== connection.sessionId || command?.activityEpoch !== connection.activityEpoch)
    throw gatewayError('STALE_CONNECTION', 'Command does not match the authenticated activity fence.')
}

function consumePreviewToken(connection) {
  const now = Date.now()
  connection.previewTokens = Math.min(20, connection.previewTokens + (now - connection.previewUpdatedAt) * 0.02)
  connection.previewUpdatedAt = now
  if (connection.previewTokens < 1)
    throw gatewayError('RATE_LIMITED', 'Preview rate limit exceeded.')
  connection.previewTokens -= 1
}

function closeConnection(connection, code, reason) {
  if (connection.websocket.readyState === WebSocket.OPEN || connection.websocket.readyState === WebSocket.CONNECTING)
    connection.websocket.close(code, reason)
  releaseConnection(connection)
}

function releaseConnection(connection) {
  if (!connections.delete(connection.connectionId))
    return
  if (connection.authenticated)
    quota.releaseAuthenticated(connection.userId, connection.roomId, connection.connectionId)
  else
    quota.releasePreAuth(connection.ip)
  if (connection.authenticated)
    void unregisterAuthenticatedConnection(connection)
}

async function registerAuthenticatedConnection(connection) {
  const key = connectionIndexKey(connection)
  await redis.expire(key, 60 * 60)
  if (!connection.sessionId || !Number.isSafeInteger(connection.activityEpoch))
    return
  const session = await repo.getActivitySession(connection.sessionId)
  const player = session?.players?.[connection.userId]
  if (!session || !player || player.online)
    return
  await commandService.submitSystemCommand({
    activityEpoch: connection.activityEpoch,
    commandId: `connection-restored:${connection.connectionId}`,
    payload: { connectionId: connection.connectionId },
    sessionId: connection.sessionId,
    type: 'connectionRestored',
  }, connection.userId)
}

async function unregisterAuthenticatedConnection(connection) {
  try {
    const key = connectionIndexKey(connection)
    await redis.sRem(key, connection.connectionId)
    if (await redis.sCard(key) > 0 || !connection.sessionId || !Number.isSafeInteger(connection.activityEpoch))
      return
    const session = await repo.getActivitySession(connection.sessionId)
    const player = session?.players?.[connection.userId]
    if (!session || !player || !player.online)
      return
    await commandService.submitSystemCommand({
      activityEpoch: connection.activityEpoch,
      commandId: `connection-lost:${connection.connectionId}`,
      payload: {},
      sessionId: connection.sessionId,
      type: 'connectionLost',
    }, connection.userId)
  }
  catch {
    // NoSQL presence reconciliation and the next authenticated connection repair state.
  }
}

function connectionIndexKey(connection) {
  return connection.distributedConnectionKey ?? `saier:connections:${connection.roomId}:${connection.userId}`
}

async function acquireDistributedConnection(key, connectionId) {
  const result = await redis.eval(`
    if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[2])
      return 1
    end
    if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[3]) then
      return 0
    end
    redis.call('SADD', KEYS[1], ARGV[1])
    redis.call('EXPIRE', KEYS[1], ARGV[2])
    return 1
  `, {
    arguments: [connectionId, '3600', '3'],
    keys: [key],
  })
  return Number(result) === 1
}

function clientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
  return forwarded || request.socket.remoteAddress || 'unknown'
}

const heartbeatTimer = setInterval(() => {
  const now = Date.now()
  for (const connection of connections.values()) {
    if (!connection.authenticated)
      continue
    if (now - connection.lastPongAt >= 20_000)
      connection.missedPongs += 1
    if (connection.missedPongs >= 2) {
      closeConnection(connection, 4408, 'heartbeat-timeout')
      continue
    }
    connection.websocket.ping()
    if (!connection.reauthRequested && connection.expiresAt - now <= 60_000) {
      connection.reauthRequested = true
      sendMessage(connection, 'committed', { expiresAt: connection.expiresAt, type: 'reauthRequired' })
    }
    if (connection.expiresAt <= now)
      closeConnection(connection, 4401, 'token-expired')
  }
}, 10_000)

const outboundTimer = setInterval(() => {
  for (const connection of connections.values())
    flushOutbound(connection)
}, 25)

const watermarkTimer = setInterval(async () => {
  for (const connection of connections.values()) {
    if (!connection.authenticated || !connection.sessionId)
      continue
    try {
      const session = await repo.getActivitySession(connection.sessionId)
      const room = session ? await repo.getRoom(session.roomId) : undefined
      const member = session ? await repo.getMemberByRoomAndUser(session.roomId, connection.userId) : undefined
      if (!session
        || !room
        || !member
        || session.status === 'finished'
        || room.activeActivity?.sessionId !== session.sessionId
        || room.activeActivity?.activityEpoch !== session.activityEpoch) {
        closeConnection(connection, 4410, 'session-ended')
        continue
      }
      sendMessage(connection, 'committed', {
        canvasSeq: session.round?.canvasSeq,
        eventSeq: session.eventSeq,
        privateProjectionRevision: session.privateProjectionRevision,
        roomMetadataRevision: room.roomMetadataRevision ?? 0,
        roundId: session.round?.roundId,
        type: 'watermark',
      })
    }
    catch {
      // The next watermark or client polling recovery will retry.
    }
  }
}, 5000)

const workerTimer = setInterval(async () => {
  await Promise.allSettled([
    outboxPublisher.publishPending(100),
    deadlineWorker.scanDue(25),
  ])
}, 1000)

async function start() {
  await redis.connect()
  await redisSubscriber.connect()
  await redisSubscriber.subscribe('saier:activity:committed', message => broadcast(JSON.parse(message), 'committed'))
  await redisSubscriber.subscribe('saier:activity:preview', message => broadcast(JSON.parse(message), 'preview'))
  await deadlineWorker.rebuildAccelerationIndex(500)
  await deadlineWorker.scanDue(100)
  server.listen(PORT, '0.0.0.0', () => {
    ready = true
  })
}

async function drain() {
  if (draining)
    return
  draining = true
  ready = false
  server.close()
  for (const connection of connections.values())
    closeConnection(connection, 1012, 'service-restart')
  await Promise.race([
    Promise.allSettled([redis.quit(), redisSubscriber.quit()]),
    new Promise(resolve => setTimeout(resolve, 30_000)),
  ])
  clearInterval(heartbeatTimer)
  clearInterval(outboundTimer)
  clearInterval(watermarkTimer)
  clearInterval(workerTimer)
  process.exit(0)
}

process.on('SIGTERM', drain)
process.on('SIGINT', drain)
start().catch((error) => {
  console.error('[saier-realtime] startup failed:', error?.message ?? error)
  process.exit(1)
})
