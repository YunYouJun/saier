import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const core = require('../cloudbase/functions/saier-room-api/activity-core.cjs') as {
  createPictionarySession: (input: Record<string, unknown>) => GamePair
  normalizeAnswer: (value: string) => string
  reducePictionaryCommand: (input: ReduceInput) => ReduceResult
  scoreGuess: (remainingMs: number, durationMs: number) => number
}

interface GamePair {
  publicState: Record<string, any>
  secretState: Record<string, any>
}

interface ReduceInput {
  command: Record<string, any>
  idGenerator: (prefix: string) => string
  now: number
  random: () => number
  secret: Record<string, any>
  state: Record<string, any>
  userId: string
}

interface ReduceResult {
  events: Array<Record<string, any>>
  privateAudienceUserIds: string[]
  secret: Record<string, any>
  state: Record<string, any>
  transient?: Record<string, any>
}

describe('pictionary authoritative reducer', () => {
  it('keeps candidates and answers out of public state and public events', () => {
    let game = createGame()
    game = apply(game, 'player-2', command('joinGame'), 1010)
    game = apply(game, 'host', command('startGame', {}, { expectedGameRevision: 1 }), 1020)

    expect(game.publicState.phase).toBe('choosing')
    expect(JSON.stringify(game.publicState)).not.toContain('apple')
    expect(game.secretState.candidates).toHaveLength(3)

    game = apply(game, 'host', command('chooseWord', { candidateIndex: 0 }, {
      expectedGameRevision: 2,
      roundId: game.publicState.round.roundId,
      phaseEpoch: game.publicState.phaseEpoch,
    }), 1030)

    expect(game.publicState.phase).toBe('drawing')
    expect(game.secretState.selectedAnswer).toBeTruthy()
    expect(JSON.stringify(game.publicState)).not.toContain(game.secretState.selectedAnswer)
  })

  it('accepts append-style concurrent guesses without expectedGameRevision', () => {
    const game = drawingGame()
    const roundId = game.publicState.round.roundId
    const phaseEpoch = game.publicState.phaseEpoch
    const answer = game.secretState.selectedAnswer

    const result = reduce(game, 'player-2', command('submitGuess', {
      displayText: answer,
      guessHash: `hash:${core.normalizeAnswer(answer)}`,
      normalizedGuess: core.normalizeAnswer(answer),
    }, { roundId, phaseEpoch }), game.publicState.round.deadlineAt - 1)

    expect(result.transient).toMatchObject({ accepted: true, correct: true })
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'guessCorrect',
      correct: true,
      userId: 'player-2',
    }))
    expect(result.events.find(event => event.type === 'roundEnded')).toMatchObject({
      finalCanvasSeq: 0,
    })
  })

  it('uses a strict server deadline boundary', () => {
    const game = drawingGame()
    const roundId = game.publicState.round.roundId
    const phaseEpoch = game.publicState.phaseEpoch
    const answer = game.secretState.selectedAnswer

    expect(() => reduce(game, 'player-2', command('submitGuess', {
      displayText: answer,
      guessHash: 'hash:answer',
      normalizedGuess: core.normalizeAnswer(answer),
    }, { roundId, phaseEpoch }), game.publicState.round.deadlineAt)).toThrow('DEADLINE_ELAPSED')
  })

  it('fences stale rounds, phases, activities, and drawer controllers', () => {
    const game = drawingGame()
    const roundId = game.publicState.round.roundId
    const phaseEpoch = game.publicState.phaseEpoch

    expect(() => reduce(game, 'player-2', command('submitGuess', {
      displayText: 'wrong',
      guessHash: 'hash:wrong',
      normalizedGuess: 'wrong',
    }, { roundId: 'old-round', phaseEpoch }), 1050)).toThrow('ROUND_MISMATCH')

    expect(() => reduce(game, 'host', command('commitStroke', { strokeId: 'stroke-1' }, {
      controllerEpoch: game.publicState.controllerEpoch - 1,
      roundId,
      phaseEpoch,
    }), 1050)).toThrow('CONTROLLER_EPOCH_MISMATCH')

    expect(() => reduce(game, 'host', {
      ...command('commitStroke', { strokeId: 'stroke-1' }, {
        controllerEpoch: game.publicState.controllerEpoch,
        roundId,
        phaseEpoch,
      }),
      activityEpoch: 1,
    }, 1050)).toThrow('ACTIVITY_EPOCH_MISMATCH')
  })

  it('assigns canvas sequence only at the authority and carries it to roundEnded', () => {
    let game = drawingGame()
    const fence = {
      controllerEpoch: game.publicState.controllerEpoch,
      roundId: game.publicState.round.roundId,
      phaseEpoch: game.publicState.phaseEpoch,
    }
    game = apply(game, 'host', command('commitStroke', { strokeId: 'stroke-1' }, fence), 1040)
    game = apply(game, 'host', command('commitStroke', { strokeId: 'stroke-2' }, fence), 1041)

    const timeout = reduce(game, 'host', command('phaseTimeout', {}, {
      roundId: fence.roundId,
      phaseEpoch: fence.phaseEpoch,
    }), game.publicState.round.deadlineAt)
    expect(timeout.events.find(event => event.type === 'roundEnded')).toMatchObject({
      finalCanvasSeq: 2,
    })
  })

  it('persists disconnect grace and lets the deadline command end a drawer-less round', () => {
    let game = drawingGame()
    const fence = {
      roundId: game.publicState.round.roundId,
      phaseEpoch: game.publicState.phaseEpoch,
    }
    game = apply(game, 'host', command('connectionLost'), 2000)
    expect(game.publicState.players.host).toMatchObject({
      online: false,
      presenceDeadlineAt: 17_000,
    })

    const timeout = reduce(game, 'host', command('phaseTimeout', {}, fence), 17_000)
    expect(timeout.state.phase).toBe('reveal')
    expect(timeout.events).toContainEqual(expect.objectContaining({
      reason: 'drawer-disconnected',
      type: 'roundEnded',
    }))
  })

  it('keeps an offline guesser eligible until reconnect grace expires', () => {
    let game = createGame()
    game = apply(game, 'player-2', command('joinGame'), 1010)
    game = apply(game, 'player-3', { ...command('joinGame'), commandId: 'join-player-3' }, 1011)
    game = apply(game, 'host', command('startGame', {}, { expectedGameRevision: 2 }), 1020)
    game = apply(game, 'host', command('chooseWord', { candidateIndex: 0 }, {
      expectedGameRevision: 3,
      roundId: game.publicState.round.roundId,
      phaseEpoch: game.publicState.phaseEpoch,
    }), 1030)
    const fence = {
      phaseEpoch: game.publicState.phaseEpoch,
      roundId: game.publicState.round.roundId,
    }
    const answer = game.secretState.selectedAnswer

    game = apply(game, 'player-3', { ...command('connectionLost'), commandId: 'lost-player-3' }, 2000)
    const guess = reduce(game, 'player-2', command('submitGuess', {
      displayText: answer,
      guessHash: `hash:${core.normalizeAnswer(answer)}`,
      normalizedGuess: core.normalizeAnswer(answer),
    }, fence), 2001)
    expect(guess.state.phase).toBe('drawing')

    const timeout = reduce({ publicState: guess.state, secretState: guess.secret }, 'host', command('phaseTimeout', {}, fence), 17_000)
    expect(timeout.state.phase).toBe('reveal')
    expect(timeout.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'playerExcused', userId: 'player-3' }),
      expect.objectContaining({ type: 'roundEnded', reason: 'all-guessed-or-excused' }),
    ]))
  })

  it('enforces a persisted burst-three, one-per-second guess bucket', () => {
    let game = drawingGame()
    const fence = { roundId: game.publicState.round.roundId, phaseEpoch: game.publicState.phaseEpoch }
    for (let index = 0; index < 3; index += 1) {
      game = apply(game, 'player-2', command('submitGuess', {
        displayText: `wrong-${index}`,
        guessHash: `hash-${index}`,
        normalizedGuess: `wrong-${index}`,
      }, fence), 2000)
    }
    expect(() => reduce(game, 'player-2', command('submitGuess', {
      displayText: 'wrong-4',
      guessHash: 'hash-4',
      normalizedGuess: 'wrong-4',
    }, fence), 2000)).toThrow('RATE_LIMITED')
    expect(() => reduce(game, 'player-2', command('submitGuess', {
      displayText: 'wrong-5',
      guessHash: 'hash-5',
      normalizedGuess: 'wrong-5',
    }, fence), 3000)).not.toThrow()
  })

  it('lets the game host mute guessing without persisting guess text', () => {
    let game = drawingGame()
    game = apply(game, 'host', command('setPlayerMuted', {
      muted: true,
      userId: 'player-2',
    }, { expectedGameRevision: game.publicState.gameRevision }), 2000)
    const fence = { phaseEpoch: game.publicState.phaseEpoch, roundId: game.publicState.round.roundId }
    expect(() => reduce(game, 'player-2', command('submitGuess', {
      displayText: 'apple',
      guessHash: 'hash:apple',
      normalizedGuess: 'apple',
    }, fence), 2001)).toThrow('PLAYER_MUTED')
  })

  it('preserves punctuation that belongs to answers and bounds score', () => {
    expect(core.normalizeAnswer(' Ｃ＋＋！')).toBe('c++')
    expect(core.normalizeAnswer('re-entry')).toBe('re-entry')
    expect(core.scoreGuess(90_000, 90_000)).toBe(500)
    expect(core.scoreGuess(-1, 90_000)).toBe(100)
  })
})

function createGame(): GamePair {
  return core.createPictionarySession({
    activityEpoch: 2,
    hostUserId: 'host',
    now: 1000,
    sessionId: 'session-1',
    serverUnicodeVersion: 'test',
    wordBankHash: 'hash:bank',
    wordBankVersion: 'test.v1',
    words: ['apple', 'bicycle', 'castle', 'dragon'],
  })
}

function drawingGame(): GamePair {
  let game = createGame()
  game = apply(game, 'player-2', command('joinGame'), 1010)
  game = apply(game, 'host', command('startGame', {}, { expectedGameRevision: 1 }), 1020)
  game = apply(game, 'host', command('chooseWord', { candidateIndex: 0 }, {
    expectedGameRevision: 2,
    roundId: game.publicState.round.roundId,
    phaseEpoch: game.publicState.phaseEpoch,
  }), 1030)
  return game
}

function apply(game: GamePair, userId: string, nextCommand: Record<string, any>, now: number): GamePair {
  const result = reduce(game, userId, nextCommand, now)
  return { publicState: result.state, secretState: result.secret }
}

function reduce(game: GamePair, userId: string, nextCommand: Record<string, any>, now: number): ReduceResult {
  return core.reducePictionaryCommand({
    command: nextCommand,
    idGenerator: prefix => `${prefix}-1`,
    now,
    random: () => 0,
    secret: game.secretState,
    state: game.publicState,
    userId,
  })
}

function command(type: string, payload: Record<string, unknown> = {}, fence: Record<string, unknown> = {}) {
  return {
    activityEpoch: 2,
    commandId: `${type}-1`,
    payload,
    sessionId: 'session-1',
    type,
    ...fence,
  }
}
