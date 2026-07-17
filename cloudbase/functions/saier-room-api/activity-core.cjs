const process = require('node:process')

const ANSWER_NORMALIZATION_VERSION = 'saier.answer-normalization.v1'
const RULES_VERSION = 1
const CHOOSING_DURATION_MS = 10_000
const REVEAL_DURATION_MS = 5_000
const DEFAULT_WORD_BANKS = Object.freeze({
  en: Object.freeze([
    'apple',
    'bicycle',
    'castle',
    'dragon',
    'elephant',
    'fireworks',
    'guitar',
    'lighthouse',
    'moon',
    'rainbow',
    'rocket',
    'snowman',
  ]),
  zh: Object.freeze([
    '苹果',
    '香蕉',
    '西瓜',
    '草莓',
    '熊猫',
    '大象',
    '长颈鹿',
    '兔子',
    '小猫',
    '小狗',
    '恐龙',
    '自行车',
    '汽车',
    '火车',
    '飞机',
    '火箭',
    '城堡',
    '灯塔',
    '房子',
    '桥',
    '吉他',
    '钢琴',
    '雨伞',
    '帽子',
    '眼镜',
    '手机',
    '电脑',
    '相机',
    '时钟',
    '月亮',
    '太阳',
    '彩虹',
    '雪人',
    '烟花',
    '风筝',
    '气球',
    '蛋糕',
    '冰淇淋',
    '汉堡',
    '茶杯',
    '花朵',
    '大树',
    '云朵',
    '海浪',
    '帆船',
    '机器人',
    '皇冠',
    '钥匙',
  ]),
})
const DEFAULT_WORD_BANK = DEFAULT_WORD_BANKS.en

function getDefaultWordBank(locale) {
  return locale === 'zh' ? DEFAULT_WORD_BANKS.zh : DEFAULT_WORD_BANKS.en
}

function createPictionarySession(input) {
  const now = input.now
  const hostUserId = requiredString(input.hostUserId, 'hostUserId')
  const words = validateWordBank(input.words ?? DEFAULT_WORD_BANK)
  const config = normalizeConfig(input.config)
  return {
    publicState: {
      activityEpoch: positiveInteger(input.activityEpoch, 'activityEpoch'),
      completedTurns: 0,
      config,
      createdAt: now,
      eventSeq: 0,
      gameHostUserId: hostUserId,
      gameRevision: 0,
      id: requiredString(input.sessionId, 'sessionId'),
      phase: 'lobby',
      phaseEpoch: 1,
      players: {
        [hostUserId]: createPlayer(hostUserId, now, 'active'),
      },
      privateProjectionRevision: 1,
      rulesVersion: RULES_VERSION,
      normalizationVersion: ANSWER_NORMALIZATION_VERSION,
      sessionId: input.sessionId,
      status: 'lobby',
      turnIndex: 0,
      turnOrder: [],
      updatedAt: now,
    },
    secretState: {
      candidates: undefined,
      frozenWordBankHash: requiredString(input.wordBankHash, 'wordBankHash'),
      remainingWords: words,
      guessRateByUser: {},
      selectedAnswer: undefined,
      selectedAnswerNormalized: undefined,
      seenGuessHashes: {},
      serverUnicodeVersion: requiredString(input.serverUnicodeVersion ?? process.versions.unicode ?? 'unknown', 'serverUnicodeVersion'),
      wordBank: words,
      wordBankVersion: requiredString(input.wordBankVersion ?? 'builtin.en.v1', 'wordBankVersion'),
    },
  }
}

function reducePictionaryCommand(input) {
  const state = clone(input.state)
  const secret = clone(input.secret)
  const command = input.command
  const now = input.now
  const userId = input.userId
  const events = []
  let transient
  let privateAudienceUserIds = []

  assertSessionFence(state, command)

  switch (command.type) {
    case 'joinGame': {
      const existing = state.players[userId]
      const status = state.status === 'lobby' ? 'active' : 'spectator'
      state.players[userId] = existing
        ? { ...existing, online: true, status: existing.status === 'left' ? status : existing.status }
        : createPlayer(userId, now, status)
      events.push({ type: 'playerJoined', userId, status: state.players[userId].status })
      break
    }
    case 'updateLobby': {
      requireHost(state, userId)
      requirePhase(state, 'lobby')
      if (command.expectedGameRevision !== state.gameRevision)
        throw activityError('REVISION_CONFLICT', 'Game revision changed.')
      state.config = normalizeConfig({ ...state.config, ...objectValue(command.payload) })
      events.push({ type: 'lobbyUpdated', config: state.config })
      break
    }
    case 'startGame': {
      requireHost(state, userId)
      requirePhase(state, 'lobby')
      const activePlayers = Object.values(state.players)
        .filter(player => player.status === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt)
      if (activePlayers.length < 2 || activePlayers.length > 12)
        throw activityError('INVALID_PLAYER_COUNT', 'Pictionary requires 2-12 active players.')
      if (command.expectedGameRevision !== state.gameRevision)
        throw activityError('REVISION_CONFLICT', 'Game revision changed.')
      state.turnOrder = activePlayers.map(player => player.userId)
      state.turnIndex = 0
      state.status = 'active'
      startChoosing(state, secret, input, events)
      privateAudienceUserIds = [state.round.drawerId]
      break
    }
    case 'chooseWord': {
      requireRoundCommand(state, command)
      requirePhase(state, 'choosing')
      requireDrawer(state, userId)
      if (command.expectedGameRevision !== state.gameRevision)
        throw activityError('REVISION_CONFLICT', 'Game revision changed.')
      chooseCandidate(state, secret, command.payload?.candidateIndex, now, events)
      privateAudienceUserIds = [userId]
      break
    }
    case 'submitGuess': {
      requireRoundCommand(state, command)
      requirePhase(state, 'drawing')
      assertBeforeDeadline(state, now)
      const result = applyGuess(state, secret, command, userId, now, events)
      transient = result.transient
      if (result.roundEnded)
        privateAudienceUserIds = Object.keys(state.players)
      break
    }
    case 'commitStroke': {
      requireRoundCommand(state, command)
      requirePhase(state, 'drawing')
      assertBeforeDeadline(state, now)
      requireDrawer(state, userId)
      if (command.controllerEpoch !== state.controllerEpoch)
        throw activityError('CONTROLLER_EPOCH_MISMATCH', 'Drawer controller changed.')
      if (state.activeControllerConnectionId && command.payload?.connectionId !== state.activeControllerConnectionId)
        throw activityError('CONTROLLER_CONNECTION_MISMATCH', 'Another drawer connection owns the controller.')
      const strokeId = requiredString(command.payload?.strokeId, 'strokeId')
      state.round.canvasSeq += 1
      events.push({
        type: 'canvasCommitted',
        canvasSeq: state.round.canvasSeq,
        roundId: state.round.roundId,
        strokeId,
      })
      break
    }
    case 'takeController': {
      requireRoundCommand(state, command)
      requireDrawer(state, userId)
      state.controllerEpoch = (state.controllerEpoch ?? 0) + 1
      state.activeControllerConnectionId = requiredString(command.payload?.connectionId, 'connectionId')
      events.push({ type: 'controllerChanged', controllerEpoch: state.controllerEpoch, drawerId: userId })
      break
    }
    case 'setPlayerMuted': {
      requireHost(state, userId)
      if (command.expectedGameRevision !== state.gameRevision)
        throw activityError('REVISION_CONFLICT', 'Game revision changed.')
      const targetUserId = requiredString(command.payload?.userId, 'userId')
      const player = requirePlayer(state, targetUserId)
      player.muted = Boolean(command.payload?.muted)
      events.push({ muted: player.muted, type: 'playerMuted', userId: targetUserId })
      break
    }
    case 'connectionLost': {
      const player = requirePlayer(state, userId)
      player.online = false
      player.connectionLostAt = now
      player.presenceDeadlineAt = now + 15_000
      if (state.gameHostUserId === userId)
        player.hostTransferDeadlineAt = now + 60_000
      events.push({ type: 'playerDisconnected', userId })
      break
    }
    case 'connectionRestored': {
      const player = requirePlayer(state, userId)
      player.online = true
      delete player.connectionLostAt
      delete player.presenceDeadlineAt
      delete player.hostTransferDeadlineAt
      if (state.round?.drawerId === userId && state.phase === 'drawing') {
        state.controllerEpoch = (state.controllerEpoch ?? 0) + 1
        state.activeControllerConnectionId = requiredString(command.payload?.connectionId, 'connectionId')
        events.push({ type: 'controllerChanged', controllerEpoch: state.controllerEpoch, drawerId: userId })
      }
      events.push({ type: 'playerReconnected', userId })
      break
    }
    case 'leaveGame': {
      const player = requirePlayer(state, userId)
      player.online = false
      player.status = 'left'
      if (state.round) {
        removeValue(state.round.eligibleGuesserIds, userId)
        if (state.round.drawerId === userId && state.phase === 'drawing') {
          endRound(state, now, events, 'drawer-left')
          privateAudienceUserIds = Object.keys(state.players)
        }
        else if (state.phase === 'drawing' && !hasRemainingEligibleGuesser(state.round)) {
          endRound(state, now, events, 'all-guessed-or-left')
          privateAudienceUserIds = Object.keys(state.players)
        }
      }
      if (state.gameHostUserId === userId)
        transferHost(state, events)
      events.push({ type: 'playerLeft', userId })
      break
    }
    case 'phaseTimeout': {
      requireRoundCommand(state, command)
      const presenceChanged = applyPresenceDeadlines(state, now, events)
      if (state.phase === 'reveal' && now >= state.round.deadlineAt) {
        advanceAfterReveal(state, secret, input, events)
        privateAudienceUserIds = state.round ? [state.round.drawerId] : []
      }
      else if (state.phase === 'choosing' && now >= state.round.deadlineAt) {
        chooseCandidate(state, secret, randomIndex(secret.candidates.length, input.random), now, events)
        privateAudienceUserIds = [state.round.drawerId]
      }
      else if (state.phase === 'drawing' && now >= state.round.deadlineAt) {
        endRound(state, now, events, 'deadline')
        privateAudienceUserIds = Object.keys(state.players)
      }
      else if (!presenceChanged) {
        throw activityError('DEADLINE_NOT_REACHED', 'No authoritative deadline has elapsed.')
      }
      if (events.some(event => event.type === 'roundEnded'))
        privateAudienceUserIds = Object.keys(state.players)
      break
    }
    case 'endActivity': {
      requireHost(state, userId)
      if (command.expectedGameRevision !== state.gameRevision)
        throw activityError('REVISION_CONFLICT', 'Game revision changed.')
      state.status = 'finished'
      state.phase = 'finished'
      state.phaseEpoch += 1
      state.finishedAt = now
      events.push({ type: 'gameFinished', scores: publicScores(state) })
      privateAudienceUserIds = Object.keys(state.players)
      break
    }
    default:
      throw activityError('UNSUPPORTED_COMMAND', `Unsupported activity command: ${command.type}`)
  }

  state.gameRevision += 1
  state.updatedAt = now
  if (privateAudienceUserIds.length > 0)
    state.privateProjectionRevision += 1
  return {
    events,
    privateAudienceUserIds: Array.from(new Set(privateAudienceUserIds)),
    secret,
    state,
    transient,
  }
}

function startChoosing(state, secret, input, events) {
  const drawerId = nextAvailableDrawer(state)
  if (!drawerId) {
    state.status = 'finished'
    state.phase = 'finished'
    state.finishedAt = input.now
    events.push({ type: 'gameFinished', scores: publicScores(state) })
    return
  }
  const roundId = input.idGenerator('round')
  const candidates = chooseCandidates(secret.remainingWords, secret.wordBank, input.random)
  secret.candidates = candidates
  secret.selectedAnswer = undefined
  secret.selectedAnswerNormalized = undefined
  secret.seenGuessHashes[roundId] = []
  state.phase = 'choosing'
  state.phaseEpoch += 1
  state.controllerEpoch = (state.controllerEpoch ?? 0) + 1
  state.round = {
    canvasSeq: 0,
    deadlineAt: input.now + CHOOSING_DURATION_MS,
    drawerId,
    durationMs: state.config.drawingDurationMs,
    eligibleGuesserIds: state.turnOrder.filter(id => id !== drawerId && state.players[id]?.status === 'active'),
    excusedUserIds: [],
    guessedUserIds: [],
    roundId,
  }
  events.push({
    type: 'roundChoosingStarted',
    deadlineAt: state.round.deadlineAt,
    drawerId,
    roundId,
  })
}

function chooseCandidate(state, secret, candidateIndex, now, events) {
  const candidates = secret.candidates ?? []
  const index = Number.isSafeInteger(candidateIndex) ? candidateIndex : 0
  const selected = candidates[index]
  if (!selected)
    throw activityError('INVALID_CANDIDATE', 'Selected word candidate is unavailable.')
  secret.selectedAnswer = selected
  secret.selectedAnswerNormalized = normalizeAnswer(selected)
  secret.candidates = undefined
  removeNormalizedWord(secret.remainingWords, secret.selectedAnswerNormalized)
  if (secret.remainingWords.length === 0)
    secret.remainingWords = [...secret.wordBank]
  state.phase = 'drawing'
  state.phaseEpoch += 1
  state.round.startedAt = now
  state.round.deadlineAt = now + state.round.durationMs
  events.push({
    type: 'roundDrawingStarted',
    deadlineAt: state.round.deadlineAt,
    drawerId: state.round.drawerId,
    roundId: state.round.roundId,
  })
}

function applyGuess(state, secret, command, userId, now, events) {
  const round = state.round
  if (state.players[userId]?.muted)
    throw activityError('PLAYER_MUTED', 'Game host muted this player.')
  if (round.drawerId === userId)
    throw activityError('DRAWER_CANNOT_GUESS', 'Drawer cannot submit guesses.')
  if (!round.eligibleGuesserIds.includes(userId) || round.excusedUserIds.includes(userId))
    throw activityError('NOT_ELIGIBLE', 'Player is not eligible to guess this round.')
  if (round.guessedUserIds.includes(userId))
    return { transient: { accepted: false, correct: true, reason: 'ALREADY_CORRECT' }, roundEnded: false }
  const normalizedGuess = requiredString(command.payload?.normalizedGuess, 'normalizedGuess')
  const guessHash = requiredString(command.payload?.guessHash, 'guessHash')
  const guessCountKey = `${round.roundId}:${userId}`
  consumeGuessToken(secret, guessCountKey, now)
  const hashes = secret.seenGuessHashes[guessCountKey] ?? []
  if (hashes.length >= 40)
    throw activityError('GUESS_LIMIT_REACHED', 'Per-round guess limit reached.')
  if (hashes.includes(guessHash))
    return { transient: { accepted: false, correct: false, reason: 'DUPLICATE' }, roundEnded: false }
  hashes.push(guessHash)
  secret.seenGuessHashes[guessCountKey] = hashes

  if (normalizedGuess !== secret.selectedAnswerNormalized) {
    return {
      transient: {
        accepted: true,
        correct: false,
        text: requiredString(command.payload?.displayText, 'displayText'),
        userId,
      },
      roundEnded: false,
    }
  }

  const awardedScore = scoreGuess(round.deadlineAt - now, round.durationMs)
  state.players[userId].score += awardedScore
  round.guessedUserIds.push(userId)
  const drawerAward = Math.min(100, Math.max(0, 500 - (state.players[round.drawerId].roundDrawerScore ?? 0)))
  state.players[round.drawerId].score += drawerAward
  state.players[round.drawerId].roundDrawerScore = (state.players[round.drawerId].roundDrawerScore ?? 0) + drawerAward
  events.push({ type: 'guessCorrect', awardedScore, correct: true, userId })
  if (!hasRemainingEligibleGuesser(round)) {
    endRound(state, now, events, 'all-guessed')
    return { transient: { accepted: true, correct: true, userId }, roundEnded: true }
  }
  return { transient: { accepted: true, correct: true, userId }, roundEnded: false }
}

function endRound(state, now, events, reason) {
  state.phase = 'reveal'
  state.phaseEpoch += 1
  state.round.deadlineAt = now + REVEAL_DURATION_MS
  state.round.finalCanvasSeq = state.round.canvasSeq
  events.push({
    type: 'roundEnded',
    deadlineAt: state.round.deadlineAt,
    finalCanvasSeq: state.round.finalCanvasSeq,
    reason,
    roundId: state.round.roundId,
  })
}

function advanceAfterReveal(state, secret, input, events) {
  state.completedTurns += 1
  state.turnIndex += 1
  const totalTurns = state.turnOrder.length * state.config.cycles
  if (state.completedTurns >= totalTurns) {
    state.status = 'finished'
    state.phase = 'finished'
    state.phaseEpoch += 1
    state.finishedAt = input.now
    state.round = undefined
    events.push({ type: 'gameFinished', scores: publicScores(state) })
    return
  }
  secret.selectedAnswer = undefined
  secret.selectedAnswerNormalized = undefined
  startChoosing(state, secret, input, events)
}

function nextAvailableDrawer(state) {
  if (state.turnOrder.length === 0)
    return undefined
  for (let offset = 0; offset < state.turnOrder.length; offset += 1) {
    const index = (state.turnIndex + offset) % state.turnOrder.length
    const userId = state.turnOrder[index]
    const player = state.players[userId]
    if (player?.status === 'active' && player.online) {
      state.turnIndex = index
      player.roundDrawerScore = 0
      return userId
    }
    state.completedTurns += 1
  }
  return undefined
}

function transferHost(state, events) {
  const next = Object.values(state.players)
    .filter(player => player.online && player.status === 'active')
    .sort((a, b) => a.joinedAt - b.joinedAt)[0]
  if (next) {
    state.gameHostUserId = next.userId
    events.push({ type: 'gameHostTransferred', userId: next.userId })
  }
}

function applyPresenceDeadlines(state, now, events) {
  let changed = false
  for (const player of Object.values(state.players)) {
    if (player.online)
      continue
    if (player.presenceDeadlineAt && now >= player.presenceDeadlineAt) {
      delete player.presenceDeadlineAt
      changed = true
      if (state.round?.drawerId === player.userId && state.phase === 'drawing') {
        endRound(state, now, events, 'drawer-disconnected')
      }
      else if (state.round?.eligibleGuesserIds.includes(player.userId)
        && !state.round.excusedUserIds.includes(player.userId)) {
        state.round.excusedUserIds.push(player.userId)
        events.push({ type: 'playerExcused', userId: player.userId })
      }
    }
    if (player.hostTransferDeadlineAt && now >= player.hostTransferDeadlineAt) {
      delete player.hostTransferDeadlineAt
      changed = true
      if (state.gameHostUserId === player.userId)
        transferHost(state, events)
    }
  }
  if (state.phase === 'drawing' && state.round) {
    if (!hasRemainingEligibleGuesser(state.round)) {
      endRound(state, now, events, 'all-guessed-or-excused')
      changed = true
    }
  }
  return changed
}

function hasRemainingEligibleGuesser(round) {
  return round.eligibleGuesserIds.some(userId =>
    !round.excusedUserIds.includes(userId)
    && !round.guessedUserIds.includes(userId))
}

function scoreGuess(remainingMs, durationMs) {
  const ratio = Math.max(0, Math.min(1, remainingMs / Math.max(1, durationMs)))
  return Math.max(100, Math.min(500, 100 + Math.floor(400 * ratio)))
}

function consumeGuessToken(secret, key, now) {
  const current = secret.guessRateByUser[key] ?? { tokens: 3, updatedAt: now }
  const elapsed = Math.max(0, now - current.updatedAt)
  const tokens = Math.min(3, current.tokens + elapsed / 1000)
  if (tokens < 1)
    throw activityError('RATE_LIMITED', 'Guess rate limit exceeded.')
  secret.guessRateByUser[key] = {
    tokens: tokens - 1,
    updatedAt: now,
  }
}

function chooseCandidates(remainingWords, fallbackWords, random) {
  const pool = remainingWords.length >= 3 ? remainingWords : fallbackWords
  const candidates = []
  const available = [...pool]
  while (candidates.length < 3 && available.length > 0) {
    candidates.push(available.splice(randomIndex(available.length, random), 1)[0])
  }
  if (candidates.length < 3)
    throw activityError('WORD_BANK_EXHAUSTED', 'At least three unique words are required.')
  return candidates
}

function randomIndex(length, random) {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new TypeError('RandomSource must return a value in [0, 1).')
  return Math.min(length - 1, Math.floor(value * length))
}

function normalizeAnswer(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[.,!?:;'"()[\]{}<>，。！？；：“”‘’、（）【】《》]/gu, '')
    .trim()
}

function validateWordBank(words) {
  if (!Array.isArray(words) || words.length < 3 || words.length > 200)
    throw new RangeError('Word bank must contain 3-200 entries.')
  const seen = new Set()
  return words.map((value) => {
    const word = requiredString(value, 'word')
    const normalized = normalizeAnswer(word)
    if (!normalized)
      throw new TypeError('Word bank entries cannot normalize to empty strings.')
    if (seen.has(normalized))
      throw new TypeError(`Duplicate normalized word: ${normalized}`)
    seen.add(normalized)
    return word
  })
}

function normalizeConfig(value = {}) {
  const cycles = [1, 2, 3, 4, 5].includes(value.cycles) ? value.cycles : 2
  const drawingDurationMs = [60_000, 90_000, 120_000].includes(value.drawingDurationMs)
    ? value.drawingDurationMs
    : 90_000
  return {
    customBank: Boolean(value.customBank),
    cycles,
    drawingDurationMs,
  }
}

function createPlayer(userId, joinedAt, status) {
  return { joinedAt, muted: false, online: true, score: 0, status, userId }
}

function requireRoundCommand(state, command) {
  if (!state.round || command.roundId !== state.round.roundId)
    throw activityError('ROUND_MISMATCH', 'Command targets a stale round.')
  if (command.phaseEpoch !== state.phaseEpoch)
    throw activityError('PHASE_EPOCH_MISMATCH', 'Command targets a stale phase.')
}

function assertSessionFence(state, command) {
  if (command.sessionId !== state.sessionId)
    throw activityError('SESSION_MISMATCH', 'Command targets a different session.')
  if (command.activityEpoch !== state.activityEpoch)
    throw activityError('ACTIVITY_EPOCH_MISMATCH', 'Command targets a stale activity.')
}

function assertBeforeDeadline(state, now) {
  if (now >= state.round.deadlineAt)
    throw activityError('DEADLINE_ELAPSED', 'Phase deadline elapsed.')
}

function requirePhase(state, phase) {
  if (state.phase !== phase)
    throw activityError('PHASE_MISMATCH', `Expected ${phase}, got ${state.phase}.`)
}

function requireDrawer(state, userId) {
  if (state.round?.drawerId !== userId)
    throw activityError('FORBIDDEN', 'Only the current drawer can perform this command.')
}

function requireHost(state, userId) {
  if (state.gameHostUserId !== userId)
    throw activityError('FORBIDDEN', 'Only the game host can perform this command.')
}

function requirePlayer(state, userId) {
  const player = state.players[userId]
  if (!player)
    throw activityError('FORBIDDEN', 'Activity membership required.')
  return player
}

function publicScores(state) {
  return Object.values(state.players)
    .map(({ userId, score }) => ({ score, userId }))
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
}

function removeNormalizedWord(words, normalized) {
  const index = words.findIndex(word => normalizeAnswer(word) === normalized)
  if (index >= 0)
    words.splice(index, 1)
}

function removeValue(values, target) {
  const index = values.indexOf(target)
  if (index >= 0)
    values.splice(index, 1)
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim())
    throw new TypeError(`${name} is required.`)
  return value.trim()
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${name} must be a positive integer.`)
  return value
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function activityError(code, message) {
  const error = new Error(code)
  error.code = code
  error.reason = code
  error.detail = message
  return error
}

module.exports = {
  ANSWER_NORMALIZATION_VERSION,
  CHOOSING_DURATION_MS,
  DEFAULT_WORD_BANK,
  DEFAULT_WORD_BANKS,
  REVEAL_DURATION_MS,
  RULES_VERSION,
  activityError,
  createPictionarySession,
  getDefaultWordBank,
  normalizeAnswer,
  reducePictionaryCommand,
  scoreGuess,
  validateWordBank,
}
