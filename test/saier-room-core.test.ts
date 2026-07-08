import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const roomCore = require('../cloudbase/functions/saier-room-api/room-core.cjs') as {
  createRoomError: (reason: string, message?: string) => Error & { code: string, detail?: string, reason: string }
  createRoomShareUrl: (origin: string | undefined, roomId: string, inviteToken?: string) => string | undefined
  integerValue: (value: unknown) => number | undefined
  requireInteger: (value: unknown, name: string) => number
  requireString: (value: unknown, name: string) => string
  sha256: (value: string) => string
  stringValue: (value: unknown) => string | undefined
}
const cloudbaseRuntime = require('../cloudbase/functions/saier-room-api/cloudbase-runtime.cjs') as {
  createCloudbaseCollectionStore: (database: CloudbaseRuntimeDatabase, collections: CloudbaseRuntimeCollections) => {
    getRoom: (id: string) => Promise<Record<string, unknown> | undefined>
  }
  getCloudbaseCallerUid: (app: { auth: () => { getUserInfo: () => { uid?: string } } }) => string | undefined
}

interface CloudbaseRuntimeCollections {
  members: string
  operations: string
  reservations: string
  rooms: string
  snapshots: string
}

interface CloudbaseRuntimeDatabase {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<{ data?: unknown }>
    }
  }
}

describe('saier room shared primitives', () => {
  it('normalizes CloudBase room errors for frontend mapping', () => {
    const error = roomCore.createRoomError('revision_conflict', 'stale base revision')

    expect(error.message).toBe('revision_conflict')
    expect(error.reason).toBe('revision_conflict')
    expect(error.code).toBe('revision_conflict')
    expect(error.detail).toBe('stale base revision')
  })

  it('builds share URLs without leaking an existing path or query', () => {
    expect(roomCore.createRoomShareUrl('https://saier.yunle.fun/shodo?x=1#old', 'sr_1', 'rt_1'))
      .toBe('https://saier.yunle.fun/?room=sr_1&invite=rt_1')
  })

  it('keeps scalar parsing strict', () => {
    expect(roomCore.stringValue('  abc  ')).toBe('abc')
    expect(roomCore.stringValue('   ')).toBeUndefined()
    expect(roomCore.integerValue(12)).toBe(12)
    expect(roomCore.integerValue(1.5)).toBeUndefined()
    expect(() => roomCore.requireString('', 'roomId')).toThrow('backend_unavailable')
    expect(() => roomCore.requireInteger(1.5, 'revision')).toThrow('backend_unavailable')
  })

  it('filters anonymous CloudBase user ids', () => {
    expect(cloudbaseRuntime.getCloudbaseCallerUid(appWithUid('user_1'))).toBe('user_1')
    expect(cloudbaseRuntime.getCloudbaseCallerUid(appWithUid('anon'))).toBeUndefined()
    expect(cloudbaseRuntime.getCloudbaseCallerUid(appWithUid(''))).toBeUndefined()
  })

  it('uses deterministic hashes for generated room document ids', () => {
    expect(roomCore.sha256('room:user')).toHaveLength(64)
    expect(roomCore.sha256('room:user')).toBe(roomCore.sha256('room:user'))
  })

  it('normalizes CloudBase doc(id).get array responses', async () => {
    const database: CloudbaseRuntimeDatabase = {
      collection: () => ({
        doc: id => ({
          get: async () => ({
            data: [{ id, status: 'pending' }],
          }),
        }),
      }),
    }
    const repo = cloudbaseRuntime.createCloudbaseCollectionStore(database, {
      members: 'members',
      operations: 'operations',
      reservations: 'reservations',
      rooms: 'rooms',
      snapshots: 'snapshots',
    })

    await expect(repo.getRoom('sr_1')).resolves.toEqual({ id: 'sr_1', status: 'pending' })
  })
})

function appWithUid(uid: string) {
  return {
    auth: () => ({
      getUserInfo: () => ({ uid }),
    }),
  }
}
