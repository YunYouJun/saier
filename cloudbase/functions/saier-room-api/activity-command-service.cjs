const { Buffer } = require('node:buffer')
const process = require('node:process')
const {
  RULES_VERSION,
  DEFAULT_WORD_BANK,
  activityError,
  createPictionarySession,
  normalizeAnswer,
  reducePictionaryCommand,
  validateWordBank,
} = require('./activity-core.cjs')
const { integerValue, objectValue, sha256, stringValue } = require('./room-core.cjs')

const INLINE_COMMIT_BYTES = 128 * 1024
const MAX_STROKE_POINTS = 8192
const RETENTION_MS = 24 * 60 * 60 * 1000

function createActivityCommandService(options) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const repo = options.repo

  return {
    activatePictionary: (input, userId) => activatePictionary(input, userId, { now, repo }),
    clearEndedActivity: input => clearEndedActivity(input, { now, repo }),
    getPrivateProjection: (input, userId) => getPrivateProjection(input, userId, { repo }),
    processDueSessions: limit => processDueSessions(limit, { now, repo }),
    resumeActivity: (input, userId) => resumeActivity(input, userId, { repo }),
    submitCommand: (input, userId) => submitCommand(input, userId, { now, repo }, false),
    submitSystemCommand: (input, userId) => submitCommand(input, userId, { now, repo }, true),
  }
}

async function activatePictionary(input, userId, services) {
  const roomId = requiredString(input.roomId, 'roomId')
  const commandId = requiredString(input.commandId, 'commandId')
  const receivedAt = services.now()
  const payloadHash = sha256(stableStringify({
    config: objectValue(input.config) ?? {},
    words: input.words,
  }))
  const commandRecordId = activationCommandId(roomId, userId, commandId)
  const sessionId = `sgs_${sha256(`${roomId}:${userId}:${commandId}`).slice(0, 40)}`

  return services.repo.runActivityTransaction(async (tx) => {
    const existing = await tx.getActivityCommand(commandRecordId)
    if (existing)
      return dedupeResult(existing, payloadHash)

    const room = await tx.getRoom(roomId)
    if (!room)
      throw activityError('ROOM_NOT_FOUND', 'Room not found.')
    const member = await tx.getMember(roomMemberId(roomId, userId))
    if (!member || room.ownerUserId !== userId)
      throw activityError('FORBIDDEN', 'Only the room owner can activate a game.')
    if (room.activeActivity && room.activeActivity.status !== 'ending')
      throw activityError('ACTIVITY_ALREADY_ACTIVE', 'Room already has an active activity.')

    const activityEpoch = Math.max(
      integerValue(room.activityEpoch) ?? 0,
      integerValue(room.activeActivity?.activityEpoch) ?? 0,
    ) + 1
    const words = validateWordBank(input.words ?? DEFAULT_WORD_BANK)
    const created = createPictionarySession({
      activityEpoch,
      config: {
        ...(objectValue(input.config) ?? {}),
        customBank: Array.isArray(input.words),
      },
      hostUserId: userId,
      now: receivedAt,
      serverUnicodeVersion: process.versions.unicode ?? 'unknown',
      sessionId,
      wordBankHash: sha256(stableStringify(words)),
      wordBankVersion: input.words ? 'custom.v1' : 'builtin.en.v1',
      words,
    })
    const activeActivity = {
      activityEpoch,
      protocolVersion: 1,
      sessionId,
      status: 'lobby',
      type: 'pictionary',
    }
    const roomMetadataRevision = (integerValue(room.roomMetadataRevision) ?? 0) + 1
    const event = {
      activityEpoch,
      createdAt: receivedAt,
      eventId: activityEventId(sessionId, 1),
      eventSeq: 1,
      gameRevision: 0,
      payload: { type: 'activityCreated' },
      rulesVersion: RULES_VERSION,
      sessionId,
    }
    created.publicState.eventSeq = 1
    const commandResult = {
      activityEpoch,
      eventSeq: 1,
      gameRevision: 0,
      ok: true,
      roomMetadataRevision,
      sessionId,
    }

    await tx.setRoom(roomId, {
      ...room,
      activeActivity,
      activityEpoch,
      roomMetadataRevision,
      updatedAt: receivedAt,
    })
    await tx.setActivitySession(sessionId, {
      ...created.publicState,
      deleteAfter: undefined,
      retainedEventSeq: 1,
      roomId,
    })
    await tx.setActivitySecret(sessionId, {
      ...created.secretState,
      activityEpoch,
      roomId,
      sessionId,
    })
    await tx.setActivityEvent(event.eventId, event)
    await tx.setActivityCommand(commandRecordId, {
      commandId,
      createdAt: receivedAt,
      id: commandRecordId,
      payloadHash,
      result: commandResult,
      roomId,
      sessionId,
      userId,
    })
    await tx.setActivityOutbox(activityOutboxId(sessionId, commandId), {
      activityEpoch,
      createdAt: receivedAt,
      eventIds: [event.eventId],
      id: activityOutboxId(sessionId, commandId),
      latestEventSeq: 1,
      privateAudienceUserIds: [],
      privateProjectionRevision: created.publicState.privateProjectionRevision,
      publishedAt: null,
      roomId,
      sessionId,
    })
    return commandResult
  })
}

async function submitCommand(input, userId, services, systemCommand = false) {
  const command = normalizeCommand(input)
  const receivedAt = services.now()
  const payloadHash = sha256(stableStringify(command))
  const commandRecordId = activityCommandId(command.sessionId, userId, command.commandId)

  const outcome = await services.repo.runActivityTransaction(async (tx) => {
    const existing = await tx.getActivityCommand(commandRecordId)
    if (existing)
      return { response: dedupeResult(existing, payloadHash) }

    const session = await tx.getActivitySession(command.sessionId)
    const secret = await tx.getActivitySecret(command.sessionId)
    if (!session || !secret)
      throw activityError('SESSION_ENDED', 'Activity session is unavailable.')
    const room = await tx.getRoom(session.roomId)
    if (!room || !matchesPointer(room.activeActivity, command))
      throw activityError('ACTIVITY_EPOCH_MISMATCH', 'Room activity pointer changed.')
    const member = await tx.getMember(roomMemberId(session.roomId, userId))
    if (!member || (!systemCommand && member.online === false && command.type !== 'joinGame'))
      throw activityError('FORBIDDEN', 'Current room membership is required.')

    if (command.type === 'commitStroke') {
      command.payload = {
        ...command.payload,
        commit: canonicalizeCommittedStroke(command.payload, session),
      }
      const strokeId = requiredString(command.payload.strokeId, 'strokeId')
      const operationId = activityCanvasOperationId(command.sessionId, command.roundId, strokeId)
      if (await tx.getActivityCanvasOperation(operationId))
        throw activityError('STROKE_ID_REUSED', 'strokeId was already committed in this round.')
    }
    if (command.type === 'submitGuess')
      command.payload = normalizeGuessPayload(command.payload)

    const reduced = reducePictionaryCommand({
      command,
      idGenerator: prefix => deterministicId(prefix, command, session),
      now: receivedAt,
      random: deterministicRandom(`${command.commandId}:${session.gameRevision}:${session.phaseEpoch}`),
      secret,
      state: session,
      userId,
    })
    const startEventSeq = integerValue(session.eventSeq) ?? 0
    const publicEvents = reduced.events.map((payload, index) => {
      const eventSeq = startEventSeq + index + 1
      return {
        activityEpoch: session.activityEpoch,
        canvasSeq: integerValue(payload.canvasSeq),
        createdAt: receivedAt,
        eventId: activityEventId(session.id, eventSeq),
        eventSeq,
        gameRevision: reduced.state.gameRevision,
        payload,
        roundId: stringValue(payload.roundId) ?? reduced.state.round?.roundId,
        rulesVersion: RULES_VERSION,
        sessionId: session.id,
      }
    })
    reduced.state.eventSeq = startEventSeq + publicEvents.length
    const canvasOperation = command.type === 'commitStroke'
      ? createCanvasOperation(command, reduced.state, receivedAt)
      : undefined
    const ended = reduced.state.status === 'finished'
    const commandResult = sanitizeCommandResult({
      activityEpoch: session.activityEpoch,
      canvasSeq: reduced.state.round?.canvasSeq,
      eventSeq: reduced.state.eventSeq,
      gameRevision: reduced.state.gameRevision,
      ok: true,
      privateProjectionRevision: reduced.state.privateProjectionRevision,
      roundId: reduced.state.round?.roundId,
      transient: reduced.transient,
    })

    await tx.setActivitySession(session.id, {
      ...reduced.state,
      deadlineAt: nextAuthorityDeadline(reduced.state),
      deleteAfter: ended ? receivedAt + RETENTION_MS : undefined,
      roomId: session.roomId,
    })
    await tx.setActivitySecret(session.id, {
      ...reduced.secret,
      activityEpoch: session.activityEpoch,
      deleteAfter: ended ? receivedAt + RETENTION_MS : undefined,
      roomId: session.roomId,
      sessionId: session.id,
    })
    for (const event of publicEvents)
      await tx.setActivityEvent(event.eventId, event)
    if (canvasOperation)
      await tx.setActivityCanvasOperation(canvasOperation.id, canvasOperation)

    const activeStatus = reduced.state.status === 'lobby'
      ? 'lobby'
      : reduced.state.status === 'finished' ? 'ending' : 'running'
    const roomMetadataRevision = activeStatus !== room.activeActivity.status
      ? (integerValue(room.roomMetadataRevision) ?? 0) + 1
      : integerValue(room.roomMetadataRevision) ?? 0
    await tx.setRoom(room.id, {
      ...room,
      activeActivity: { ...room.activeActivity, status: activeStatus },
      roomMetadataRevision,
      updatedAt: receivedAt,
    })
    await tx.setActivityCommand(commandRecordId, {
      commandId: command.commandId,
      createdAt: receivedAt,
      deleteAfter: ended ? receivedAt + RETENTION_MS : undefined,
      id: commandRecordId,
      payloadHash,
      result: commandResult,
      roomId: session.roomId,
      sessionId: session.id,
      userId,
    })
    await tx.setActivityOutbox(activityOutboxId(session.id, command.commandId), {
      activityEpoch: session.activityEpoch,
      createdAt: receivedAt,
      deleteAfter: ended ? receivedAt + RETENTION_MS : undefined,
      eventIds: publicEvents.map(event => event.eventId),
      id: activityOutboxId(session.id, command.commandId),
      latestCanvasSeq: reduced.state.round?.canvasSeq,
      latestEventSeq: reduced.state.eventSeq,
      privateAudienceUserIds: reduced.privateAudienceUserIds,
      privateProjectionRevision: reduced.state.privateProjectionRevision,
      publishedAt: null,
      roomId: session.roomId,
      sessionId: session.id,
    })
    return {
      response: {
        ...commandResult,
        transient: reduced.transient,
      },
    }
  })
  return outcome.response
}

async function resumeActivity(input, userId, services) {
  const sessionId = requiredString(input.sessionId, 'sessionId')
  const activityEpoch = positiveInteger(input.activityEpoch, 'activityEpoch')
  const cursor = objectValue(input.cursor) ?? {}
  const session = await services.repo.getActivitySession(sessionId)
  if (!session || session.activityEpoch !== activityEpoch)
    return { kind: 'SESSION_ENDED', endedAt: session?.finishedAt }
  const room = await services.repo.getRoom(session.roomId)
  const member = await services.repo.getMemberByRoomAndUser(session.roomId, userId)
  if (!room || !member)
    throw activityError('FORBIDDEN', 'Current room membership is required.')
  if (!matchesPointer(room.activeActivity, { sessionId, activityEpoch }))
    return { kind: 'SESSION_ENDED', endedAt: session.finishedAt }

  const watermark = createWatermark(room, session)
  const lastEventSeq = nonNegativeInteger(cursor.lastEventSeq, 'lastEventSeq')
  const roomMetadataRevision = nonNegativeInteger(cursor.roomMetadataRevision, 'roomMetadataRevision')
  const lastCanvasSeq = optionalNonNegativeInteger(cursor.lastCanvasSeq, 'lastCanvasSeq') ?? 0
  if (lastEventSeq > watermark.eventSeq || roomMetadataRevision > watermark.roomMetadataRevision || lastCanvasSeq > (watermark.canvasSeq ?? 0)) {
    return { kind: 'RESYNC_REQUIRED', reason: 'CURSOR_AHEAD', watermark }
  }
  if (cursor.roundId && cursor.roundId !== watermark.roundId) {
    return { kind: 'RESYNC_REQUIRED', reason: 'ROUND_MISMATCH', watermark }
  }

  const retainedEventSeq = integerValue(session.retainedEventSeq) ?? 0
  if (lastEventSeq < retainedEventSeq) {
    const canvasOperations = session.round
      ? await services.repo.listActivityCanvasOperations(sessionId, session.round.roundId, 0, 500)
      : []
    return {
      kind: 'SNAPSHOT_REQUIRED',
      snapshot: {
        canvas: { operations: canvasOperations.map(publicCanvasOperation) },
        roundId: session.round?.roundId,
        snapshotCanvasSeq: session.round?.canvasSeq,
        snapshotEventSeq: session.eventSeq,
        state: publicSession(session),
      },
      watermark,
    }
  }

  const events = await services.repo.listActivityEvents(sessionId, lastEventSeq, 500)
  const canvasOperations = session.round
    ? await services.repo.listActivityCanvasOperations(sessionId, session.round.roundId, lastCanvasSeq, 500)
    : []
  return {
    canvasOperations: canvasOperations.map(publicCanvasOperation),
    events: events.map(publicEvent),
    kind: 'DELTA',
    state: publicSession(session),
    watermark,
  }
}

async function getPrivateProjection(input, userId, services) {
  const sessionId = requiredString(input.sessionId, 'sessionId')
  const activityEpoch = positiveInteger(input.activityEpoch, 'activityEpoch')
  const session = await services.repo.getActivitySession(sessionId)
  const secret = await services.repo.getActivitySecret(sessionId)
  if (!session || !secret || session.activityEpoch !== activityEpoch)
    throw activityError('SESSION_ENDED', 'Activity session is unavailable.')
  const room = await services.repo.getRoom(session.roomId)
  if (!room || !matchesPointer(room.activeActivity, { activityEpoch, sessionId }))
    throw activityError('SESSION_ENDED', 'Activity session is no longer active.')
  const member = await services.repo.getMemberByRoomAndUser(session.roomId, userId)
  if (!member)
    throw activityError('FORBIDDEN', 'Current room membership is required.')

  const projection = {
    phase: session.phase,
    privateProjectionRevision: session.privateProjectionRevision,
    roundId: session.round?.roundId,
    sessionId,
  }
  if (session.phase === 'choosing' && session.round?.drawerId === userId)
    projection.candidates = clone(secret.candidates ?? [])
  if (session.phase === 'drawing' && session.round?.drawerId === userId)
    projection.answer = secret.selectedAnswer
  if (session.phase === 'reveal')
    projection.answer = secret.selectedAnswer
  return projection
}

async function clearEndedActivity(input, services) {
  const roomId = requiredString(input.roomId, 'roomId')
  const sessionId = requiredString(input.sessionId, 'sessionId')
  const activityEpoch = positiveInteger(input.activityEpoch, 'activityEpoch')
  return services.repo.runActivityTransaction(async (tx) => {
    const room = await tx.getRoom(roomId)
    const session = await tx.getActivitySession(sessionId)
    if (!room || !matchesPointer(room.activeActivity, { sessionId, activityEpoch }))
      return { cleared: false }
    if (!session || session.status !== 'finished')
      throw activityError('SESSION_NOT_FINISHED', 'Only finished sessions can be cleared.')
    await tx.setRoom(roomId, {
      ...room,
      activeActivity: undefined,
      roomMetadataRevision: (integerValue(room.roomMetadataRevision) ?? 0) + 1,
      updatedAt: services.now(),
    })
    return { cleared: true }
  })
}

async function processDueSessions(limit, services) {
  const receivedAt = services.now()
  const due = await services.repo.listDueActivitySessions(receivedAt, Math.min(100, positiveInteger(limit ?? 25, 'limit')))
  const results = []
  for (const session of due) {
    if (!session.round || !Number.isFinite(session.deadlineAt) || receivedAt < session.deadlineAt)
      continue
    try {
      results.push(await submitCommand({
        activityEpoch: session.activityEpoch,
        commandId: `timeout:${session.round.roundId}:${session.phaseEpoch}:${session.deadlineAt}`,
        payload: {},
        phaseEpoch: session.phaseEpoch,
        roundId: session.round.roundId,
        sessionId: session.sessionId,
        type: 'phaseTimeout',
      }, session.gameHostUserId, { ...services, now: () => receivedAt }, true))
    }
    catch (error) {
      if (!['COMMAND_ID_REUSED', 'DEADLINE_NOT_REACHED', 'PHASE_EPOCH_MISMATCH', 'ROUND_MISMATCH'].includes(error?.code))
        throw error
    }
  }
  return results
}

function createCanvasOperation(command, state, createdAt) {
  const payload = command.payload
  const strokeId = requiredString(payload.strokeId, 'strokeId')
  return {
    activityEpoch: command.activityEpoch,
    canvasSeq: state.round.canvasSeq,
    controllerEpoch: command.controllerEpoch,
    createdAt,
    id: activityCanvasOperationId(command.sessionId, state.round.roundId, strokeId),
    payload: clone(payload.commit),
    phaseEpoch: command.phaseEpoch,
    roundId: state.round.roundId,
    sessionId: command.sessionId,
    strokeId,
  }
}

function nextAuthorityDeadline(state) {
  const deadlines = []
  if (Number.isFinite(state.round?.deadlineAt))
    deadlines.push(state.round.deadlineAt)
  for (const player of Object.values(state.players ?? {})) {
    if (Number.isFinite(player.presenceDeadlineAt))
      deadlines.push(player.presenceDeadlineAt)
    if (Number.isFinite(player.hostTransferDeadlineAt))
      deadlines.push(player.hostTransferDeadlineAt)
  }
  return deadlines.length > 0 ? Math.min(...deadlines) : undefined
}

function canonicalizeCommittedStroke(payload, session) {
  const value = objectValue(payload)
  const strokeId = requiredString(value?.strokeId, 'strokeId')
  if (!['pen', 'marker', 'eraser'].includes(value?.tool) || value?.brushVersion !== 'saier.activity-brush.v1')
    throw activityError('INVALID_STROKE', 'Committed stroke tool or brush version is not allowed.')
  if (!value?.commit || typeof value.commit !== 'object')
    throw activityError('INVALID_STROKE', 'Canonical stroke payload is required.')
  const bytes = Buffer.byteLength(JSON.stringify(value.commit), 'utf8')
  if (bytes > INLINE_COMMIT_BYTES)
    throw activityError('STROKE_TOO_LARGE', 'Inline committed stroke exceeds 128KiB.')
  const events = Array.isArray(value.commit.events) ? value.commit.events : []
  if (events.length < 1 || events.length > MAX_STROKE_POINTS)
    throw activityError('STROKE_TOO_LARGE', 'Committed stroke must contain 1-8192 events.')
  let previousTime = -1
  const canonicalEvents = events.map((event) => {
    if (!Number.isFinite(event?.t) || event.t < 0 || event.t > session.round.durationMs)
      throw activityError('INVALID_STROKE', 'Stroke contains invalid timing.')
    if (event.t < previousTime)
      throw activityError('INVALID_STROKE', 'Stroke event time must be monotonic.')
    previousTime = event.t
    if (event?.kind === 'tick')
      return { kind: 'tick', t: event.t }
    if (event?.kind !== 'point')
      throw activityError('INVALID_STROKE', 'Stroke contains an unsupported event kind.')
    if (![event.x, event.y].every(Number.isFinite) || event.x < -32 || event.x > 1056 || event.y < -32 || event.y > 800)
      throw activityError('INVALID_STROKE', 'Stroke contains invalid or out-of-bounds coordinates.')
    if (!Number.isFinite(event.pressure) || event.pressure < 0 || event.pressure > 1)
      throw activityError('INVALID_STROKE', 'Stroke pressure must be within [0, 1].')
    return {
      kind: 'point',
      pressure: event.pressure,
      t: event.t,
      x: event.x,
      y: event.y,
    }
  })
  const activityTool = value.tool
  const color = activityTool === 'eraser'
    ? { a: 1, b: 1, g: 1, r: 1 }
    : canonicalColor(value.commit.brushContextSnapshot?.color)
  const preset = activityTool === 'marker' ? activityMarkerPreset() : activityPenPreset()
  const baseSize = activityTool === 'marker' ? 22 : activityTool === 'eraser' ? 20 : 8
  return {
    brushContextSnapshot: { baseSize, color },
    brushEngine: { id: 'simple', version: 'saier.activity-brush.v1' },
    brushPresetId: activityTool === 'eraser' ? 'eraser' : preset.id,
    brushPresetSnapshot: activityTool === 'eraser'
      ? { kind: 'eraser', options: { pressureFallback: 'velocity' } }
      : { kind: 'brush', options: { baseSize }, preset },
    compositeMode: activityTool === 'eraser' ? 'erase' : 'normal',
    events: canonicalEvents,
    id: strokeId,
    inputPipeline: 'resolved-v1',
    layerId: 'layer-1',
    paintTarget: 'layer',
    schema: 'saier.stroke.v1',
    tool: activityTool === 'eraser' ? 'eraser' : 'brush',
  }
}

function canonicalColor(value) {
  const color = objectValue(value)
  const channels = ['r', 'g', 'b', 'a'].map(channel => color?.[channel])
  if (!channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1))
    return { a: 1, b: 0, g: 0, r: 0 }
  return { a: channels[3], b: channels[2], g: channels[1], r: channels[0] }
}

function activityPenPreset() {
  return {
    engine: 'simple',
    group: 'Sketching',
    hardness: 0,
    id: 'pen',
    maxOpacity: 1,
    maxSizeRatio: 1,
    minOpacity: 0.85,
    minSizeRatio: 0.18,
    name: 'Pen',
    opacity: 1,
    opacityCurve: 'ease-out',
    size: 8,
    sizeCurve: 'linear',
    source: 'builtin',
    spacing: 0.22,
    taperMinFactor: 0.18,
    tipId: 'round-hard',
  }
}

function activityMarkerPreset() {
  return {
    blendMode: 'max-alpha',
    engine: 'simple',
    group: 'Inking',
    hardness: 0.16,
    id: 'marker',
    maxOpacity: 0.42,
    maxSizeRatio: 1,
    minOpacity: 0.28,
    minSizeRatio: 0.72,
    name: 'Marker',
    opacity: 0.62,
    opacityCurve: 'linear',
    rotation: -Math.PI / 7,
    size: 22,
    source: 'builtin',
    spacing: 0.18,
    tipId: 'marker-chisel',
  }
}

function normalizeGuessPayload(payload) {
  const displayText = requiredString(payload?.displayText, 'displayText')
  if (Buffer.byteLength(displayText, 'utf8') > 256 || graphemeCount(displayText) > 64)
    throw activityError('GUESS_TOO_LARGE', 'Guess exceeds the input limit.')
  const normalizedGuess = normalizeAnswer(displayText)
  if (!normalizedGuess)
    throw activityError('INVALID_GUESS', 'Guess normalizes to an empty value.')
  return {
    displayText,
    guessHash: sha256(normalizedGuess),
    normalizedGuess,
  }
}

function graphemeCount(value) {
  if (typeof Intl.Segmenter === 'function')
    return Array.from(new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)).length
  return Array.from(value).length
}

function normalizeCommand(input) {
  const command = {
    activityEpoch: positiveInteger(input.activityEpoch, 'activityEpoch'),
    commandId: requiredString(input.commandId, 'commandId'),
    controllerEpoch: optionalPositiveInteger(input.controllerEpoch, 'controllerEpoch'),
    expectedGameRevision: optionalNonNegativeInteger(input.expectedGameRevision, 'expectedGameRevision'),
    payload: objectValue(input.payload) ?? {},
    phaseEpoch: optionalPositiveInteger(input.phaseEpoch, 'phaseEpoch'),
    roundId: stringValue(input.roundId),
    sessionId: requiredString(input.sessionId, 'sessionId'),
    type: requiredString(input.type, 'type'),
  }
  return command
}

function dedupeResult(existing, payloadHash) {
  if (existing.payloadHash !== payloadHash)
    throw activityError('COMMAND_ID_REUSED', 'commandId was already used with a different payload.')
  return { ...clone(existing.result), deduped: true }
}

function sanitizeCommandResult(result) {
  const transient = result.transient
  return {
    activityEpoch: result.activityEpoch,
    canvasSeq: result.canvasSeq,
    eventSeq: result.eventSeq,
    gameRevision: result.gameRevision,
    ok: true,
    privateProjectionRevision: result.privateProjectionRevision,
    roundId: result.roundId,
    ...(transient
      ? {
          transient: {
            accepted: Boolean(transient.accepted),
            correct: Boolean(transient.correct),
            reason: stringValue(transient.reason),
            userId: stringValue(transient.userId),
          },
        }
      : {}),
  }
}

function createWatermark(room, session) {
  return {
    canvasSeq: session.round?.canvasSeq,
    eventSeq: session.eventSeq,
    privateProjectionRevision: session.privateProjectionRevision,
    roomMetadataRevision: integerValue(room.roomMetadataRevision) ?? 0,
    roundId: session.round?.roundId,
  }
}

function publicSession(session) {
  const value = clone(session)
  delete value.activeControllerConnectionId
  delete value.deleteAfter
  delete value.roomId
  return value
}

function publicEvent(event) {
  return {
    activityEpoch: event.activityEpoch,
    canvasSeq: event.canvasSeq,
    eventId: event.eventId,
    eventSeq: event.eventSeq,
    gameRevision: event.gameRevision,
    payload: clone(event.payload),
    roundId: event.roundId,
    rulesVersion: event.rulesVersion,
    sessionId: event.sessionId,
  }
}

function publicCanvasOperation(operation) {
  return {
    activityEpoch: operation.activityEpoch,
    canvasSeq: operation.canvasSeq,
    controllerEpoch: operation.controllerEpoch,
    operationId: operation.id,
    payload: clone(operation.payload),
    phaseEpoch: operation.phaseEpoch,
    roundId: operation.roundId,
    sessionId: operation.sessionId,
    strokeId: operation.strokeId,
  }
}

function matchesPointer(activeActivity, fence) {
  return activeActivity?.sessionId === fence.sessionId
    && activeActivity.activityEpoch === fence.activityEpoch
}

function deterministicId(prefix, command, session) {
  return `${prefix}_${sha256(`${session.sessionId}:${command.commandId}:${prefix}`).slice(0, 24)}`
}

function deterministicRandom(seed) {
  let offset = 0
  const digest = sha256(seed)
  return () => {
    const start = offset % Math.max(1, digest.length - 8)
    offset += 8
    const chunk = digest.slice(start, start + 8).padEnd(8, '0')
    return Number.parseInt(chunk, 16) / 0x100000000
  }
}

function stableStringify(value) {
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function activationCommandId(roomId, userId, commandId) {
  return `sac_${sha256(`activate:${roomId}:${userId}:${commandId}`).slice(0, 40)}`
}

function activityCommandId(sessionId, userId, commandId) {
  return `sac_${sha256(`${sessionId}:${userId}:${commandId}`).slice(0, 40)}`
}

function activityEventId(sessionId, eventSeq) {
  return `sge_${sha256(`${sessionId}:${eventSeq}`).slice(0, 40)}`
}

function activityOutboxId(sessionId, commandId) {
  return `sgo_${sha256(`${sessionId}:${commandId}`).slice(0, 40)}`
}

function activityCanvasOperationId(sessionId, roundId, strokeId) {
  return `sgc_${sha256(`${sessionId}:${roundId}:${strokeId}`).slice(0, 40)}`
}

function roomMemberId(roomId, userId) {
  return `srm_${sha256(`${roomId}:${userId}`).slice(0, 40)}`
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim())
    throw activityError('INVALID_COMMAND', `${name} is required.`)
  return value.trim()
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw activityError('INVALID_COMMAND', `${name} must be a positive integer.`)
  return value
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw activityError('INVALID_CURSOR', `${name} must be a non-negative integer.`)
  return value
}

function optionalPositiveInteger(value, name) {
  return value === undefined ? undefined : positiveInteger(value, name)
}

function optionalNonNegativeInteger(value, name) {
  return value === undefined ? undefined : nonNegativeInteger(value, name)
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

module.exports = {
  INLINE_COMMIT_BYTES,
  MAX_STROKE_POINTS,
  RETENTION_MS,
  createActivityCommandService,
  stableStringify,
}
