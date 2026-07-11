const { Buffer } = require('node:buffer')
const {
  createRoomError: roomError,
  createRoomRandomId: createRandomId,
  createRoomShareUrl: createShareUrl,
  integerValue,
  objectValue,
  positiveInteger,
  requireInteger,
  requireString,
  sha256,
  stringValue,
} = require('./room-core.cjs')

const SAIER_APP_ID = 'saier'
const SAIER_PROJECT_FORMAT = 'saier.project'
const DEFAULT_MAX_SNAPSHOT_BYTES = 200 * 1024 * 1024
const DEFAULT_OPERATION_LIMIT = 200
const MAX_OPERATION_LIMIT = 500

const ROOM_OPERATION_TYPES = new Set([
  'stroke:start',
  'stroke:append',
  'stroke:commit',
  'document:command',
  'layer:command',
  'project:snapshot',
])

function createSaierRoomApiHandler(options) {
  const maxSnapshotBytes = positiveInteger(options.maxSnapshotBytes) ?? DEFAULT_MAX_SNAPSHOT_BYTES
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const randomId = typeof options.randomId === 'function' ? options.randomId : createRandomId
  const hash = typeof options.hash === 'function' ? options.hash : sha256

  return async function saierRoomApi(event = {}, context = {}) {
    const action = stringValue(event.action)
    if (!action)
      throw roomError('backend_unavailable', 'Missing room action.')

    const userId = await options.getCurrentUserId(event, context)
    if (!stringValue(userId))
      throw roomError('not_authenticated', 'Authentication required.')

    const services = {
      hash,
      maxSnapshotBytes,
      now,
      randomId,
      repo: options.repo,
      shareOrigin: stringValue(options.shareOrigin),
      storage: options.storage,
      userId,
    }

    switch (action) {
      case 'createRoomSnapshotUpload':
        return createRoomSnapshotUpload(event, services)
      case 'finalizeRoomSnapshotUpload':
        return finalizeRoomSnapshotUpload(event, services)
      case 'finalizeRoomSnapshotText':
        return finalizeRoomSnapshotText(event, services)
      case 'joinRoom':
        return joinRoom(event, services)
      case 'leaveRoom':
        return leaveRoom(event, services)
      case 'appendOperation':
        return appendOperation(event, services)
      case 'listOperations':
        return listOperations(event, services)
      case 'createSnapshotUpload':
        return createSnapshotUpload(event, services)
      case 'finalizeSnapshotUpload':
        return finalizeSnapshotUpload(event, services)
      case 'finalizeSnapshotText':
        return finalizeSnapshotText(event, services)
      case 'setMemberRole':
        return setMemberRole(event, services)
      case 'setRoomMode':
        return setRoomMode(event, services)
      case 'updatePresence':
        return updatePresence(event, services)
      default:
        throw roomError('backend_unavailable', `Unsupported room action: ${action}`)
    }
  }
}

async function createRoomSnapshotUpload(event, services) {
  assertSaierProjectPayload(event, services.maxSnapshotBytes)

  const time = services.now()
  const roomId = services.randomId('sr')
  const reservationId = services.randomId('rs')
  const visibility = parseVisibility(event.visibility)
  const mode = parseMode(event.mode) ?? 'viewer'
  const title = safeTitle(event.title)
  const fileName = safeSnapshotFileName(event.fileName, title)
  const inviteToken = visibility === 'link' ? services.randomId('rt') : undefined
  const storageKey = `room-storage/saier/${roomId}/${reservationId}/${fileName}`
  const room = {
    createdAt: time,
    headRevision: 0,
    id: roomId,
    inviteTokenHash: inviteToken ? services.hash(inviteToken) : undefined,
    latestSnapshotRevision: 0,
    mode,
    ownerUserId: services.userId,
    status: 'pending',
    title,
    updatedAt: time,
    visibility,
  }
  const reservation = {
    appId: SAIER_APP_ID,
    contentType: 'application/json',
    createdAt: time,
    fileName,
    format: SAIER_PROJECT_FORMAT,
    id: reservationId,
    inviteToken,
    kind: 'initial',
    ownerUserId: services.userId,
    roomId,
    sizeBytes: integerValue(event.sizeBytes),
    status: 'pending',
    storageKey,
    targetRevision: 0,
    updatedAt: time,
  }

  await services.repo.createRoom(room)
  await services.repo.upsertMember({
    displayName: stringValue(event.displayName),
    id: roomMemberId(roomId, services.userId),
    joinedAt: time,
    lastSeenAt: time,
    online: true,
    role: 'owner',
    roomId,
    userId: services.userId,
  })
  await services.repo.createReservation(reservation)

  return {
    inviteToken,
    maxBytes: services.maxSnapshotBytes,
    room: publicRoom(room),
    shareUrl: createShareUrl(services.shareOrigin, roomId, inviteToken),
    upload: {
      fileName,
      reservationId,
      storageKey,
    },
  }
}

async function finalizeRoomSnapshotUpload(event, services) {
  const reservation = await requireInitialSnapshotReservation(event, services)
  assertReservationFinalization(event, reservation, services.maxSnapshotBytes)
  const fileId = requireString(event.fileId, 'fileId')

  return finalizeInitialSnapshot(services, reservation, fileId)
}

async function finalizeRoomSnapshotText(event, services) {
  const reservation = await requireInitialSnapshotReservation(event, services)
  assertReservationFinalization(event, reservation, services.maxSnapshotBytes)

  const text = requireString(event.text, 'text')
  const sizeBytes = Buffer.byteLength(text, 'utf8')
  if (sizeBytes !== reservation.sizeBytes || sizeBytes > services.maxSnapshotBytes)
    throw roomError('too_large', 'Snapshot size mismatch.')
  if (!services.storage?.uploadSnapshotText)
    throw roomError('backend_unavailable', 'Snapshot text upload is not configured.')

  const fileId = await services.storage.uploadSnapshotText(reservation, text)
  return finalizeInitialSnapshot(services, reservation, fileId)
}

async function requireInitialSnapshotReservation(event, services) {
  const reservation = await requireReservation(services.repo, event.reservationId)
  if (reservation.kind !== 'initial' || reservation.ownerUserId !== services.userId)
    throw roomError('forbidden', 'Only the room owner can finalize the initial snapshot.')
  return reservation
}

async function finalizeInitialSnapshot(services, reservation, fileId) {
  const room = await requireRoom(services.repo, reservation.roomId)
  const time = services.now()
  const snapshot = {
    createdAt: time,
    fileId,
    id: roomSnapshotId(room.id, 0),
    revision: 0,
    roomId: room.id,
    sizeBytes: reservation.sizeBytes,
    storageKey: reservation.storageKey,
  }
  const nextRoom = {
    ...room,
    headRevision: 0,
    latestSnapshotRevision: 0,
    status: 'active',
    updatedAt: time,
  }

  await services.repo.updateReservation(reservation.id, {
    fileId,
    finalizedAt: time,
    status: 'finalized',
    updatedAt: time,
  })
  await services.repo.createSnapshot(snapshot)
  await services.repo.updateRoom(room.id, {
    headRevision: nextRoom.headRevision,
    latestSnapshotRevision: nextRoom.latestSnapshotRevision,
    status: nextRoom.status,
    updatedAt: nextRoom.updatedAt,
  })

  return {
    session: await createSession(services, nextRoom, services.userId, reservation.inviteToken),
  }
}

async function joinRoom(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const room = await requireRoom(services.repo, roomId)
  const existingMember = await services.repo.getMember(roomId, services.userId)
  const inviteToken = stringValue(event.inviteToken)
  let member = existingMember

  if (!member) {
    if (room.visibility !== 'link' || !inviteToken || room.inviteTokenHash !== services.hash(inviteToken))
      throw roomError('forbidden', 'Invalid or expired room invitation.')

    const time = services.now()
    member = {
      displayName: stringValue(event.displayName),
      id: roomMemberId(roomId, services.userId),
      joinedAt: time,
      lastSeenAt: time,
      online: true,
      role: 'viewer',
      roomId,
      userId: services.userId,
    }
    await services.repo.upsertMember(member)
  }
  else {
    await services.repo.updateMember(member.id, {
      lastSeenAt: services.now(),
      online: true,
    })
    member = { ...member, lastSeenAt: services.now(), online: true }
  }

  const snapshot = await services.repo.getLatestSnapshot(roomId)
  if (!snapshot)
    throw roomError('invalid_snapshot', 'Room snapshot is not ready.')

  const download = await createSnapshotDownload(services.storage, snapshot, services.maxSnapshotBytes)
  return {
    session: await createSession(services, room, services.userId, inviteToken),
    snapshot: download,
  }
}

async function leaveRoom(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const member = await services.repo.getMember(roomId, services.userId)
  if (!member)
    return { ok: true }

  await services.repo.updateMember(member.id, {
    lastSeenAt: services.now(),
    online: false,
  })
  return { ok: true }
}

async function appendOperation(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const clientOpId = requireString(event.clientOpId, 'clientOpId')
  const type = requireOperationType(event.type)
  const baseRevision = requireInteger(event.baseRevision, 'baseRevision')
  const room = await requireRoom(services.repo, roomId)
  const member = await requireMember(services.repo, roomId, services.userId)

  if (!canSubmitOperation(room, member))
    throw roomError('forbidden', 'Current room role cannot submit operations.')

  const operationId = roomOperationId(roomId, clientOpId, services.hash)
  const existing = await services.repo.getOperation(operationId)
  if (existing) {
    return {
      deduped: true,
      operation: publicOperation(existing),
      room: publicRoom(room),
    }
  }
  if (baseRevision !== room.headRevision)
    throw roomError('revision_conflict', 'Operation base revision is stale.')

  const revision = room.headRevision + 1
  const time = services.now()
  const operation = {
    baseRevision,
    clientId: stringValue(event.clientId) ?? services.userId,
    clientOpId,
    createdAt: time,
    id: operationId,
    payload: objectValue(event.payload) ?? {},
    revision,
    roomId,
    type,
    userId: services.userId,
  }
  const nextRoom = {
    ...room,
    headRevision: revision,
    latestSnapshotRevision: type === 'project:snapshot' ? revision : room.latestSnapshotRevision,
    updatedAt: time,
  }

  await services.repo.createOperation(operation)
  await services.repo.updateRoom(roomId, {
    headRevision: nextRoom.headRevision,
    latestSnapshotRevision: nextRoom.latestSnapshotRevision,
    updatedAt: nextRoom.updatedAt,
  })

  return {
    deduped: false,
    operation: publicOperation(operation),
    room: publicRoom(nextRoom),
  }
}

async function listOperations(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const room = await requireReadableRoom(services.repo, roomId, services.userId)

  const afterRevision = integerValue(event.afterRevision) ?? -1
  const limit = Math.min(integerValue(event.limit) ?? DEFAULT_OPERATION_LIMIT, MAX_OPERATION_LIMIT)
  if (afterRevision < room.latestSnapshotRevision) {
    const snapshot = await services.repo.getLatestSnapshot(roomId)
    if (!snapshot)
      throw roomError('invalid_snapshot', 'Room snapshot is not ready.')

    const snapshotRevision = integerValue(snapshot.revision) ?? room.latestSnapshotRevision
    const operations = await services.repo.listOperationsAfter(roomId, snapshotRevision, limit)
    return {
      items: operations.map(publicOperation),
      nextRevision: operations.at(-1)?.revision ?? snapshotRevision,
      room: publicRoom(room),
      snapshot: await createSnapshotDownload(services.storage, snapshot, services.maxSnapshotBytes),
      snapshotRequired: true,
      snapshotRevision,
    }
  }

  const operations = await services.repo.listOperationsAfter(roomId, afterRevision, limit)
  return {
    items: operations.map(publicOperation),
    nextRevision: operations.at(-1)?.revision ?? afterRevision,
    room: publicRoom(room),
    snapshotRequired: false,
  }
}

async function createSnapshotUpload(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  assertSaierProjectPayload(event, services.maxSnapshotBytes)
  const room = await requireRoom(services.repo, roomId)
  const member = await requireMember(services.repo, roomId, services.userId)
  if (!canSubmitOperation(room, member))
    throw roomError('forbidden', 'Current room role cannot create snapshots.')

  const time = services.now()
  const reservationId = services.randomId('rs')
  const fileName = safeSnapshotFileName(event.fileName, room.title)
  const storageKey = `room-storage/saier/${room.id}/snapshots/${reservationId}/${fileName}`
  const reservation = {
    appId: SAIER_APP_ID,
    contentType: 'application/json',
    createdAt: time,
    fileName,
    format: SAIER_PROJECT_FORMAT,
    id: reservationId,
    kind: 'checkpoint',
    ownerUserId: services.userId,
    roomId: room.id,
    sizeBytes: integerValue(event.sizeBytes),
    status: 'pending',
    storageKey,
    targetRevision: room.headRevision,
    updatedAt: time,
  }

  await services.repo.createReservation(reservation)
  return {
    maxBytes: services.maxSnapshotBytes,
    room: publicRoom(room),
    upload: {
      fileName,
      reservationId,
      storageKey,
    },
  }
}

async function finalizeSnapshotUpload(event, services) {
  const reservation = await requireReservation(services.repo, event.reservationId)
  if (reservation.kind !== 'checkpoint')
    throw roomError('forbidden', 'Only checkpoint snapshot reservations can use this finalize action.')
  if (reservation.ownerUserId !== services.userId)
    throw roomError('forbidden', 'Only the snapshot reservation owner can finalize it.')

  const room = await requireRoom(services.repo, reservation.roomId)
  await requireMember(services.repo, room.id, services.userId)
  assertReservationFinalization(event, reservation, services.maxSnapshotBytes)

  const fileId = requireString(event.fileId, 'fileId')
  return finalizeCheckpointSnapshot(services, reservation, room, fileId)
}

async function finalizeSnapshotText(event, services) {
  const reservation = await requireReservation(services.repo, event.reservationId)
  if (reservation.kind !== 'checkpoint')
    throw roomError('forbidden', 'Only checkpoint snapshot reservations can use this finalize action.')
  if (reservation.ownerUserId !== services.userId)
    throw roomError('forbidden', 'Only the snapshot reservation owner can finalize it.')

  const room = await requireRoom(services.repo, reservation.roomId)
  await requireMember(services.repo, room.id, services.userId)
  assertReservationFinalization(event, reservation, services.maxSnapshotBytes)

  const text = requireString(event.text, 'text')
  const sizeBytes = Buffer.byteLength(text, 'utf8')
  if (sizeBytes !== reservation.sizeBytes || sizeBytes > services.maxSnapshotBytes)
    throw roomError('too_large', 'Snapshot size mismatch.')
  if (!services.storage?.uploadSnapshotText)
    throw roomError('backend_unavailable', 'Snapshot text upload is not configured.')

  const fileId = await services.storage.uploadSnapshotText(reservation, text)
  return finalizeCheckpointSnapshot(services, reservation, room, fileId)
}

async function finalizeCheckpointSnapshot(services, reservation, room, fileId) {
  const time = services.now()
  const revision = reservation.targetRevision
  const snapshot = {
    createdAt: time,
    fileId,
    id: roomSnapshotId(room.id, revision),
    revision,
    roomId: room.id,
    sizeBytes: reservation.sizeBytes,
    storageKey: reservation.storageKey,
  }
  const nextRoom = {
    ...room,
    latestSnapshotRevision: revision,
    updatedAt: time,
  }

  await services.repo.updateReservation(reservation.id, {
    fileId,
    finalizedAt: time,
    status: 'finalized',
    updatedAt: time,
  })
  await services.repo.createSnapshot(snapshot)
  await services.repo.updateRoom(room.id, {
    latestSnapshotRevision: revision,
    updatedAt: time,
  })

  return {
    room: publicRoom(nextRoom),
    snapshot: publicSnapshot(snapshot),
  }
}

async function setMemberRole(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const targetUserId = requireString(event.userId, 'userId')
  const role = parseRole(event.role)
  if (!role || role === 'owner')
    throw roomError('forbidden', 'Only viewer/editor role changes are allowed.')

  const room = await requireOwnedRoom(services.repo, roomId, services.userId)
  const current = await services.repo.getMember(roomId, targetUserId)
  const time = services.now()
  const member = {
    displayName: current?.displayName,
    id: roomMemberId(roomId, targetUserId),
    joinedAt: current?.joinedAt ?? time,
    lastSeenAt: current?.lastSeenAt ?? time,
    online: current?.online ?? false,
    role,
    roomId,
    userId: targetUserId,
  }
  await services.repo.upsertMember(member)

  return {
    members: await publicMembers(services.repo, roomId),
    room: publicRoom(room),
  }
}

async function setRoomMode(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const mode = parseMode(event.mode)
  if (!mode)
    throw roomError('backend_unavailable', 'Invalid room mode.')

  const room = await requireOwnedRoom(services.repo, roomId, services.userId)
  const driverUserId = stringValue(event.driverUserId)
  if (mode === 'driver' && driverUserId) {
    const driver = await services.repo.getMember(roomId, driverUserId)
    if (!driver || driver.role !== 'editor')
      throw roomError('forbidden', 'Driver must be an editor.')
  }

  const nextRoom = {
    ...room,
    driverUserId: mode === 'driver' ? driverUserId : undefined,
    mode,
    updatedAt: services.now(),
  }
  await services.repo.updateRoom(roomId, {
    driverUserId: nextRoom.driverUserId,
    mode,
    updatedAt: nextRoom.updatedAt,
  })

  return {
    room: publicRoom(nextRoom),
  }
}

async function updatePresence(event, services) {
  const roomId = requireString(event.roomId, 'roomId')
  const room = await requireRoom(services.repo, roomId)
  const member = await requireMember(services.repo, roomId, services.userId)
  const time = services.now()
  const presence = objectValue(event.presence)
  await services.repo.updateMember(member.id, {
    lastSeenAt: time,
    online: true,
    ...(presence ? { presence } : {}),
  })
  return {
    expiresAt: time + 30_000,
    members: await publicMembers(services.repo, roomId),
    ok: true,
    room: publicRoom(room),
  }
}

async function createSession(services, room, userId, inviteToken) {
  const member = await requireMember(services.repo, room.id, userId)
  return {
    inviteToken: inviteToken ?? undefined,
    members: await publicMembers(services.repo, room.id),
    readOnly: !canSubmitOperation(room, member),
    role: member.role,
    room: publicRoom(room),
    shareUrl: createShareUrl(services.shareOrigin, room.id, inviteToken),
  }
}

async function createSnapshotDownload(storage, snapshot, maxBytes) {
  if (storage?.downloadSnapshot)
    return storage.downloadSnapshot(snapshot, maxBytes)

  if (storage?.getDownloadUrl) {
    const downloadUrl = await storage.getDownloadUrl(snapshot.fileId, snapshot.storageKey)
    return {
      downloadUrl,
      maxBytes,
    }
  }

  throw roomError('backend_unavailable', 'Snapshot storage is not configured.')
}

async function requireReadableRoom(repo, roomId, userId) {
  const room = await requireRoom(repo, roomId)
  await requireMember(repo, roomId, userId)
  return room
}

async function requireOwnedRoom(repo, roomId, userId) {
  const room = await requireRoom(repo, roomId)
  if (room.ownerUserId !== userId)
    throw roomError('forbidden', 'Only the room owner can change this setting.')
  return room
}

async function requireRoom(repo, roomId) {
  const room = await repo.getRoom(roomId)
  if (!room)
    throw roomError('room_not_found', 'Room not found.')
  return room
}

async function requireReservation(repo, reservationId) {
  const id = requireString(reservationId, 'reservationId')
  const reservation = await repo.getReservation(id)
  if (!reservation || reservation.status !== 'pending')
    throw roomError('room_not_found', 'Snapshot reservation not found.')
  return reservation
}

async function requireMember(repo, roomId, userId) {
  const member = await repo.getMember(roomId, userId)
  if (!member)
    throw roomError('forbidden', 'Room membership required.')
  return member
}

function assertSaierProjectPayload(event, maxSnapshotBytes) {
  if (event.appId !== SAIER_APP_ID)
    throw roomError('forbidden', 'Invalid app id.')
  if (event.format !== SAIER_PROJECT_FORMAT)
    throw roomError('invalid_snapshot', 'Invalid project format.')
  if (!/^application\/json(?:;|$)/i.test(String(event.contentType ?? '')))
    throw roomError('invalid_snapshot', 'Snapshot content type must be JSON.')

  const sizeBytes = requireInteger(event.sizeBytes, 'sizeBytes')
  if (sizeBytes <= 0 || sizeBytes > maxSnapshotBytes)
    throw roomError('too_large', 'Snapshot exceeds room limit.')
}

function assertReservationFinalization(event, reservation, maxSnapshotBytes) {
  if (requireString(event.roomId, 'roomId') !== reservation.roomId)
    throw roomError('forbidden', 'Reservation room mismatch.')
  if (requireString(event.storageKey, 'storageKey') !== reservation.storageKey)
    throw roomError('forbidden', 'Reservation storage key mismatch.')

  const sizeBytes = requireInteger(event.sizeBytes, 'sizeBytes')
  if (sizeBytes !== reservation.sizeBytes || sizeBytes > maxSnapshotBytes)
    throw roomError('too_large', 'Snapshot size mismatch.')
}

function canSubmitOperation(room, member) {
  if (member.role === 'owner')
    return true
  if (member.role !== 'editor')
    return false
  if (room.mode === 'multi-editor')
    return true
  if (room.mode === 'driver')
    return room.driverUserId === member.userId
  return false
}

function publicRoom(room) {
  return {
    createdAt: room.createdAt,
    driverUserId: room.driverUserId,
    headRevision: room.headRevision,
    id: room.id,
    latestSnapshotRevision: room.latestSnapshotRevision,
    mode: room.mode,
    ownerUserId: room.ownerUserId,
    title: room.title,
    updatedAt: room.updatedAt,
    visibility: room.visibility,
  }
}

function publicMembers(repo, roomId) {
  return repo.listMembers(roomId).then(members => members.map(member => ({
    displayName: member.displayName,
    lastSeenAt: member.lastSeenAt,
    online: Boolean(member.online),
    presence: objectValue(member.presence),
    role: member.role,
    roomId: member.roomId,
    userId: member.userId,
  })))
}

function publicOperation(operation) {
  return {
    baseRevision: operation.baseRevision,
    clientId: operation.clientId,
    clientOpId: operation.clientOpId,
    createdAt: operation.createdAt,
    payload: operation.payload,
    revision: operation.revision,
    roomId: operation.roomId,
    type: operation.type,
    userId: operation.userId,
  }
}

function publicSnapshot(snapshot) {
  return {
    createdAt: snapshot.createdAt,
    fileId: snapshot.fileId,
    revision: snapshot.revision,
    roomId: snapshot.roomId,
    sizeBytes: snapshot.sizeBytes,
    storageKey: snapshot.storageKey,
  }
}

function requireOperationType(value) {
  const type = stringValue(value)
  if (!type || !ROOM_OPERATION_TYPES.has(type))
    throw roomError('backend_unavailable', 'Invalid operation type.')
  return type
}

function parseVisibility(value) {
  return value === 'private' ? 'private' : 'link'
}

function parseMode(value) {
  return value === 'viewer' || value === 'driver' || value === 'multi-editor' ? value : undefined
}

function parseRole(value) {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? value : undefined
}

function safeTitle(value) {
  return stringValue(value)?.slice(0, 96) ?? 'Saier Room'
}

function safeSnapshotFileName(value, title) {
  const fileName = stringValue(value) ?? `${safeFileName(title)}.saier.room-snapshot.json`
  const cleaned = safeFileName(fileName)
  return cleaned.endsWith('.json') ? cleaned : `${cleaned}.json`
}

function safeFileName(value) {
  return String(value)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    || 'saier-room'
}

function roomMemberId(roomId, userId) {
  return `srm_${sha256(`${roomId}:${userId}`).slice(0, 40)}`
}

function roomSnapshotId(roomId, revision) {
  return `srs_${sha256(`${roomId}:${revision}`).slice(0, 40)}`
}

function roomOperationId(roomId, clientOpId, hash) {
  return `sro_${hash(`${roomId}:${clientOpId}`).slice(0, 40)}`
}

module.exports = {
  DEFAULT_MAX_SNAPSHOT_BYTES,
  SAIER_APP_ID,
  SAIER_PROJECT_FORMAT,
  createSaierRoomApiHandler,
  roomMemberId,
}
