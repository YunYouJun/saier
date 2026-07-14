export const PICTIONARY_RULES_VERSION = 1
export const PICTIONARY_NORMALIZATION_VERSION = 'saier.answer-normalization.v1'
export const PICTIONARY_CANVAS_WIDTH = 1024
export const PICTIONARY_CANVAS_HEIGHT = 768

export type PictionaryPhase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'finished'
export type PictionaryPlayerStatus = 'active' | 'spectator' | 'left'
export type PictionaryCommandType
  = | 'joinGame'
    | 'updateLobby'
    | 'startGame'
    | 'chooseWord'
    | 'submitGuess'
    | 'commitStroke'
    | 'takeController'
    | 'setPlayerMuted'
    | 'leaveGame'
    | 'endActivity'

export interface PictionaryConfig {
  cycles: 1 | 2 | 3 | 4 | 5
  drawingDurationMs: 60_000 | 90_000 | 120_000
  customBank: boolean
}

export interface PictionaryPlayer {
  userId: string
  joinedAt: number
  online: boolean
  status: PictionaryPlayerStatus
  score: number
  muted: boolean
}

export interface PictionaryRound {
  roundId: string
  drawerId: string
  eligibleGuesserIds: string[]
  guessedUserIds: string[]
  excusedUserIds: string[]
  canvasSeq: number
  finalCanvasSeq?: number
  startedAt?: number
  deadlineAt: number
  durationMs: number
}

export interface PictionaryPublicState {
  sessionId: string
  activityEpoch: number
  status: 'lobby' | 'active' | 'finished'
  phase: PictionaryPhase
  phaseEpoch: number
  gameRevision: number
  eventSeq: number
  privateProjectionRevision: number
  gameHostUserId: string
  turnOrder: string[]
  turnIndex: number
  completedTurns: number
  controllerEpoch?: number
  activeControllerConnectionId?: string
  config: PictionaryConfig
  players: Record<string, PictionaryPlayer>
  round?: PictionaryRound
  rulesVersion: 1
  normalizationVersion: typeof PICTIONARY_NORMALIZATION_VERSION
}

export interface PictionarySecretState {
  wordBankVersion: string
  serverUnicodeVersion: string
  frozenWordBankHash: string
  remainingWords: string[]
  selectedAnswer?: string
  selectedAnswerNormalized?: string
  candidates?: string[]
  seenGuessHashes: Record<string, string[]>
}

export function normalizePictionaryAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/[.,!?:;'"()[\]{}<>，。！？；：“”‘’、（）【】《》]/gu, '')
    .trim()
}

export function validateCustomWordBank(words: readonly string[]): string[] {
  if (words.length < 3 || words.length > 200)
    throw new RangeError('Custom word bank must contain 3-200 entries.')
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of words) {
    const word = raw.trim()
    const normalized = normalizePictionaryAnswer(word)
    if (!normalized)
      throw new TypeError('Word bank entries cannot normalize to an empty answer.')
    if (seen.has(normalized))
      throw new TypeError(`Duplicate normalized word bank entry: ${normalized}`)
    seen.add(normalized)
    result.push(word)
  }
  return result
}

export function scorePictionaryGuess(remainingMs: number, durationMs: number): number {
  const safeDuration = Math.max(1, durationMs)
  const ratio = Math.max(0, Math.min(1, remainingMs / safeDuration))
  return Math.max(100, Math.min(500, 100 + Math.floor(400 * ratio)))
}

export function pictionaryActivityStoragePrefix(
  roomId: string,
  activityEpoch: number,
  sessionId: string,
): string {
  if (!roomId.trim() || !sessionId.trim() || !Number.isSafeInteger(activityEpoch) || activityEpoch < 1)
    throw new TypeError('A valid roomId, sessionId, and activityEpoch are required.')
  return `room-storage/saier/${roomId}/activities/${activityEpoch}/${sessionId}/`
}
