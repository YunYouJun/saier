import { describe, expect, it } from 'vitest'
import {
  createActiveActivity,
  createActivityDocument,
  createActivitySessionStorage,
  createCollaborationModeMigrationPatch,
  intersectInteractionPolicy,
  matchesActiveActivity,
  normalizePictionaryAnswer,
  pictionaryActivityStoragePrefix,
  readCollaborationMode,
  scorePictionaryGuess,
  validateCustomWordBank,
} from '../packages/collaboration/src'

describe('room activity protocol', () => {
  it('reads collaborationMode first and keeps the compatibility mode write', () => {
    expect(readCollaborationMode({ collaborationMode: 'driver', mode: 'viewer' })).toBe('driver')
    expect(readCollaborationMode({ mode: 'multi-editor' })).toBe('multi-editor')
    expect(createCollaborationModeMigrationPatch('driver', 4)).toEqual({
      collaborationMode: 'driver',
      mode: 'driver',
      roomMetadataRevision: 5,
    })
  })

  it('increments activity epochs and rejects stale cleanup fences', () => {
    const active = createActiveActivity(6, {
      type: 'pictionary',
      sessionId: 'session-2',
      status: 'lobby',
    })
    expect(active.activityEpoch).toBe(7)
    expect(matchesActiveActivity(active, { sessionId: 'session-2', activityEpoch: 7 })).toBe(true)
    expect(matchesActiveActivity(active, { sessionId: 'session-1', activityEpoch: 6 })).toBe(false)
  })

  it('intersects interaction permissions without allowing extensions to expand them', () => {
    const policy = intersectInteractionPolicy(
      { canDraw: true, canGuess: true, tools: ['pen', 'marker', 'eraser'] },
      { canDraw: true, canGuess: false, tools: ['pen', 'eraser'] },
      { canDraw: true, canGuess: true, tools: ['pen', 'marker'] },
    )
    expect(policy).toEqual({ canDraw: true, canGuess: false, tools: ['pen'] })
    expect(Object.isFrozen(policy)).toBe(true)
  })

  it('bounds session storage and rejects secret-looking keys', () => {
    const storage = createActivitySessionStorage(64)
    storage.set('ui', { panel: 'score' })
    expect(storage.get('ui')).toEqual({ panel: 'score' })
    expect(storage.sizeBytes()).toBeGreaterThan(0)
    expect(() => storage.set('currentAnswer', 'cat')).toThrow('Secrets are not allowed')
    expect(() => storage.set('oversize', 'x'.repeat(100))).toThrow('exceeds 64 bytes')
    storage.clear()
    expect(storage.sizeBytes()).toBe(2)
  })

  it('constructs fixed activity documents without accepting a main document id', () => {
    const document = createActivityDocument({
      sessionId: 'session-1',
      activityEpoch: 4,
      roundId: 'round-2',
    })
    expect(document).toMatchObject({
      id: 'activity:4:session-1:round-2',
      width: 1024,
      height: 768,
      layers: [{ id: 'layer-1', type: 'raster' }],
    })
    expect(Object.isFrozen(document)).toBe(true)
    expect(Object.isFrozen(document.layers)).toBe(true)
  })
})

describe('pictionary v1 rules', () => {
  it('normalizes with the frozen punctuation policy while preserving code-like words', () => {
    expect(normalizePictionaryAnswer('  Ｃ＋＋！ ')).toBe('c++')
    expect(normalizePictionaryAnswer('Re-entry')).toBe('re-entry')
    expect(normalizePictionaryAnswer('你，好！')).toBe('你好')
  })

  it('dedupes custom words after normalization', () => {
    expect(() => validateCustomWordBank(['Apple', ' apple! ', 'Pear']))
      .toThrow('Duplicate normalized word bank entry')
    expect(validateCustomWordBank(['C++', 'C#', 'Re-entry'])).toEqual(['C++', 'C#', 'Re-entry'])
  })

  it('applies the bounded remaining-time score formula', () => {
    expect(scorePictionaryGuess(90_000, 90_000)).toBe(500)
    expect(scorePictionaryGuess(45_000, 90_000)).toBe(300)
    expect(scorePictionaryGuess(0, 90_000)).toBe(100)
    expect(scorePictionaryGuess(-1, 90_000)).toBe(100)
  })

  it('builds an activity-only storage prefix', () => {
    expect(pictionaryActivityStoragePrefix('room-1', 3, 'session-2'))
      .toBe('room-storage/saier/room-1/activities/3/session-2/')
  })
})
