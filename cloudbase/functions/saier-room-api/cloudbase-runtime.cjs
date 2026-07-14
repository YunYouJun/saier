const { Buffer } = require('node:buffer')

const ANON_UIDS = new Set(['', 'anon'])

function getCloudbaseCallerUid(cloudbaseApp) {
  try {
    const auth = cloudbaseApp.auth()
    const info = auth.getUserInfo()
    const uid = stringValue(info?.uid) ?? ''
    return ANON_UIDS.has(uid) ? undefined : uid
  }
  catch {
    return undefined
  }
}

function createCloudbaseCollectionStore(database, collections) {
  return {
    createMember: doc => addDocument(database, collections.members, doc),
    createOperation: doc => addDocument(database, collections.operations, doc),
    createReservation: doc => addDocument(database, collections.reservations, doc),
    createRoom: doc => addDocument(database, collections.rooms, doc),
    createSnapshot: doc => addDocument(database, collections.snapshots, doc),
    getMember: (roomId, userId) => getOne(database, collections.members, { roomId, userId }),
    getOperation: id => getById(database, collections.operations, id),
    getReservation: id => getById(database, collections.reservations, id),
    getRoom: id => getById(database, collections.rooms, id),
    getLatestSnapshot: roomId => getOne(database, collections.snapshots, { roomId }, ['revision', 'desc']),
    listMembers: roomId => getMany(database, collections.members, { roomId }, ['joinedAt', 'asc'], 200),
    listOperationsAfter: (roomId, afterRevision, limit) =>
      getOperationsAfter(database, collections.operations, roomId, afterRevision, limit),
    updateMember: (id, patch) => updateById(database, collections.members, id, patch),
    updateReservation: (id, patch) => updateById(database, collections.reservations, id, patch),
    updateRoom: (id, patch) => updateById(database, collections.rooms, id, patch),
    upsertMember: doc => upsertDocument(database, collections.members, doc),
    getActivitySecret: id => getById(database, collections.activitySecrets, id),
    getActivitySession: id => getById(database, collections.activitySessions, id),
    getMemberByRoomAndUser: (roomId, userId) => getOne(database, collections.members, { roomId, userId }),
    listActivityCanvasOperations: (sessionId, roundId, afterCanvasSeq, limit) =>
      getSequenceAfter(database, collections.activityCanvasOperations, {
        sessionId,
        roundId,
      }, 'canvasSeq', afterCanvasSeq, limit),
    listActivityEvents: (sessionId, afterEventSeq, limit) =>
      getSequenceAfter(database, collections.activityEvents, { sessionId }, 'eventSeq', afterEventSeq, limit),
    listDueActivitySessions: (now, limit) => getDueActivitySessions(database, collections.activitySessions, now, limit),
    listActiveActivitySessions: limit => getMany(database, collections.activitySessions, { status: 'active' }, ['deadlineAt', 'asc'], limit),
    listPendingActivityOutbox: limit => getMany(database, collections.activityOutbox, { publishedAt: null }, ['createdAt', 'asc'], limit),
    markActivityOutboxPublished: (id, publishedAt) => updateById(database, collections.activityOutbox, id, { publishedAt }),
    runActivityTransaction: updateFunction => runActivityTransaction(database, collections, updateFunction),
  }
}

async function runActivityTransaction(database, collections, updateFunction, maxAttempts = 3) {
  if (typeof database.runTransaction !== 'function')
    throw new TypeError('CloudBase database transaction support is required for activity commands.')

  let lastError
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await database.runTransaction(transaction =>
        updateFunction(createActivityTransactionStore(transaction, collections)))
      return response?.result ?? response
    }
    catch (error) {
      lastError = error
      if (!isTransactionConflict(error) || attempt === maxAttempts)
        throw error
    }
  }
  throw lastError
}

function createActivityTransactionStore(transaction, collections) {
  return {
    getActivityCanvasOperation: id => getById(transaction, collections.activityCanvasOperations, id),
    getActivityCommand: id => getById(transaction, collections.activityCommands, id),
    getActivitySecret: id => getById(transaction, collections.activitySecrets, id),
    getActivitySession: id => getById(transaction, collections.activitySessions, id),
    getMember: id => getById(transaction, collections.members, id),
    getRoom: id => getById(transaction, collections.rooms, id),
    setActivityCanvasOperation: (id, doc) => setById(transaction, collections.activityCanvasOperations, id, doc),
    setActivityCommand: (id, doc) => setById(transaction, collections.activityCommands, id, doc),
    setActivityEvent: (id, doc) => setById(transaction, collections.activityEvents, id, doc),
    setActivityOutbox: (id, doc) => setById(transaction, collections.activityOutbox, id, doc),
    setActivitySecret: (id, doc) => setById(transaction, collections.activitySecrets, id, doc),
    setActivitySession: (id, doc) => setById(transaction, collections.activitySessions, id, doc),
    setMember: (id, doc) => setById(transaction, collections.members, id, doc),
    setRoom: (id, doc) => setById(transaction, collections.rooms, id, doc),
  }
}

function createCloudbaseSnapshotStorage(cloudbaseApp) {
  return {
    async getDownloadUrl(fileId) {
      const response = await cloudbaseApp.getTempFileURL({
        fileList: [fileId],
      })
      const item = response.fileList?.[0]
      const url = item?.tempFileURL ?? item?.download_url ?? item?.downloadUrl
      if (!url)
        throw new Error(item?.message ?? 'Snapshot download URL unavailable.')
      return url
    },
    async uploadSnapshotText(reservation, text) {
      const response = await cloudbaseApp.uploadFile({
        cloudPath: reservation.storageKey,
        fileContent: Buffer.from(text, 'utf8'),
      })
      if (!response.fileID)
        throw new Error(response.message ?? 'Snapshot upload failed.')
      return response.fileID
    },
  }
}

async function addDocument(database, collectionName, doc) {
  await database.collection(collectionName).add({ ...doc, _id: doc.id })
}

async function upsertDocument(database, collectionName, doc) {
  const existing = await getById(database, collectionName, doc.id)
  if (existing) {
    await updateById(database, collectionName, doc.id, doc)
    return
  }
  await addDocument(database, collectionName, doc)
}

async function getById(database, collectionName, id) {
  try {
    const response = await database.collection(collectionName).doc(id).get()
    if (Array.isArray(response.data))
      return response.data[0]
    return response.data ?? undefined
  }
  catch {
    return undefined
  }
}

async function getOne(database, collectionName, query, orderBy) {
  const records = await getMany(database, collectionName, query, orderBy, 1)
  return records[0]
}

async function getMany(database, collectionName, query, orderBy, limit) {
  let request = database.collection(collectionName).where(query)
  if (orderBy)
    request = request.orderBy(orderBy[0], orderBy[1])
  const response = await request.limit(limit).get()
  return Array.isArray(response.data) ? response.data : []
}

async function getOperationsAfter(database, collectionName, roomId, afterRevision, limit) {
  const command = database.command
  if (!command?.gt) {
    const records = await getMany(database, collectionName, { roomId }, ['revision', 'asc'], limit + 50)
    return records.filter(record => record.revision > afterRevision).slice(0, limit)
  }

  const response = await database
    .collection(collectionName)
    .where({
      revision: command.gt(afterRevision),
      roomId,
    })
    .orderBy('revision', 'asc')
    .limit(limit)
    .get()
  return Array.isArray(response.data) ? response.data : []
}

async function getSequenceAfter(database, collectionName, equalityQuery, sequenceField, afterSequence, limit) {
  const command = database.command
  if (!command?.gt) {
    const records = await getMany(database, collectionName, equalityQuery, [sequenceField, 'asc'], limit + 50)
    return records.filter(record => record[sequenceField] > afterSequence).slice(0, limit)
  }
  const response = await database
    .collection(collectionName)
    .where({
      ...equalityQuery,
      [sequenceField]: command.gt(afterSequence),
    })
    .orderBy(sequenceField, 'asc')
    .limit(limit)
    .get()
  return Array.isArray(response.data) ? response.data : []
}

async function getDueActivitySessions(database, collectionName, now, limit) {
  const command = database.command
  if (!command?.lte)
    return []
  const response = await database
    .collection(collectionName)
    .where({
      deadlineAt: command.lte(now),
      status: 'active',
    })
    .orderBy('deadlineAt', 'asc')
    .limit(limit)
    .get()
  return Array.isArray(response.data) ? response.data : []
}

async function updateById(database, collectionName, id, patch) {
  await database.collection(collectionName).doc(id).update(patch)
}

async function setById(database, collectionName, id, doc) {
  await database.collection(collectionName).doc(id).set(sanitizeDocument({ ...doc, id }))
}

function sanitizeDocument(value) {
  if (Array.isArray(value))
    return value.map(sanitizeDocument)
  if (!value || typeof value !== 'object' || value instanceof Date || ArrayBuffer.isView(value))
    return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, sanitizeDocument(item)]),
  )
}

function isTransactionConflict(error) {
  const code = String(error?.code ?? error?.errCode ?? '')
  const message = String(error?.message ?? error?.errMsg ?? '')
  return /conflict|write.?lock|transaction.*retry|DATABASE_TRANSACTION_CONFLICT/i.test(`${code} ${message}`)
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

module.exports = {
  createActivityTransactionStore,
  createCloudbaseCollectionStore,
  createCloudbaseSnapshotStorage,
  getCloudbaseCallerUid,
  sanitizeDocument,
}
