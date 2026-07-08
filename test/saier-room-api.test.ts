import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSaierRoomApiHandler } = require('../cloudbase/functions/saier-room-api/handler.cjs') as {
  createSaierRoomApiHandler: (options: RoomApiTestOptions) => (event: Record<string, unknown>, context?: Record<string, unknown>) => Promise<Record<string, unknown>>
}

interface RoomApiTestOptions {
  getCurrentUserId: () => Promise<string> | string
  hash: (value: string) => string
  now: () => number
  randomId: (prefix: string) => string
  repo: MemoryRoomRepository
  shareOrigin: string
  storage: {
    downloadSnapshot: (snapshot: MemoryRecord, maxBytes: number) => Promise<{ maxBytes: number, text: string }>
    uploadSnapshotText?: (reservation: MemoryRecord, text: string) => Promise<string>
  }
}

type MemoryRecord = Record<string, unknown> & { id: string }

class MemoryRoomRepository {
  private readonly rooms = new Map<string, MemoryRecord>()
  private readonly members = new Map<string, MemoryRecord>()
  private readonly reservations = new Map<string, MemoryRecord>()
  private readonly snapshots = new Map<string, MemoryRecord>()
  private readonly operations = new Map<string, MemoryRecord>()

  async createRoom(doc: MemoryRecord): Promise<void> {
    this.rooms.set(doc.id, { ...doc })
  }

  async getRoom(id: string): Promise<MemoryRecord | undefined> {
    return this.clone(this.rooms.get(id))
  }

  async updateRoom(id: string, patch: Record<string, unknown>): Promise<void> {
    this.patch(this.rooms, id, patch)
  }

  async upsertMember(doc: MemoryRecord): Promise<void> {
    this.members.set(doc.id, { ...doc })
  }

  async getMember(roomId: string, userId: string): Promise<MemoryRecord | undefined> {
    return this.findOne(this.members, record => record.roomId === roomId && record.userId === userId)
  }

  async listMembers(roomId: string): Promise<MemoryRecord[]> {
    return this.findMany(this.members, record => record.roomId === roomId)
      .sort((a, b) => Number(a.joinedAt) - Number(b.joinedAt))
  }

  async updateMember(id: string, patch: Record<string, unknown>): Promise<void> {
    this.patch(this.members, id, patch)
  }

  async createReservation(doc: MemoryRecord): Promise<void> {
    this.reservations.set(doc.id, { ...doc })
  }

  async getReservation(id: string): Promise<MemoryRecord | undefined> {
    return this.clone(this.reservations.get(id))
  }

  async updateReservation(id: string, patch: Record<string, unknown>): Promise<void> {
    this.patch(this.reservations, id, patch)
  }

  async createSnapshot(doc: MemoryRecord): Promise<void> {
    this.snapshots.set(doc.id, { ...doc })
  }

  async getLatestSnapshot(roomId: string): Promise<MemoryRecord | undefined> {
    return this.findMany(this.snapshots, record => record.roomId === roomId)
      .sort((a, b) => Number(b.revision) - Number(a.revision))
      .at(0)
  }

  async createOperation(doc: MemoryRecord): Promise<void> {
    this.operations.set(doc.id, { ...doc })
  }

  async getOperation(id: string): Promise<MemoryRecord | undefined> {
    return this.clone(this.operations.get(id))
  }

  async listOperationsAfter(roomId: string, afterRevision: number, limit: number): Promise<MemoryRecord[]> {
    return this.findMany(this.operations, record => record.roomId === roomId && Number(record.revision) > afterRevision)
      .sort((a, b) => Number(a.revision) - Number(b.revision))
      .slice(0, limit)
  }

  private findOne(records: Map<string, MemoryRecord>, predicate: (record: MemoryRecord) => boolean): MemoryRecord | undefined {
    return this.findMany(records, predicate).at(0)
  }

  private findMany(records: Map<string, MemoryRecord>, predicate: (record: MemoryRecord) => boolean): MemoryRecord[] {
    return Array.from(records.values()).filter(predicate).map(record => ({ ...record }))
  }

  private patch(records: Map<string, MemoryRecord>, id: string, patch: Record<string, unknown>): void {
    const current = records.get(id)
    if (!current)
      throw new Error(`Missing record: ${id}`)
    records.set(id, { ...current, ...patch })
  }

  private clone(record: MemoryRecord | undefined): MemoryRecord | undefined {
    return record ? { ...record } : undefined
  }
}

function createHarness(initialUserId = 'owner') {
  let currentUserId = initialUserId
  let currentTime = 1000
  const counters = new Map<string, number>()
  const repo = new MemoryRoomRepository()
  const storageUploads: Array<{ reservationId: string, text: string }> = []
  const handler = createSaierRoomApiHandler({
    getCurrentUserId: () => currentUserId,
    hash: value => `hash:${value}`,
    now: () => currentTime++,
    randomId(prefix: string) {
      const next = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, next)
      return `${prefix}_${next}`
    },
    repo,
    shareOrigin: 'https://saier.yunle.fun',
    storage: {
      async downloadSnapshot(_snapshot: MemoryRecord, maxBytes: number) {
        return {
          maxBytes,
          text: JSON.stringify({
            format: 'saier.project',
            height: 64,
            layers: [],
            metadata: {},
            surfaces: [],
            version: 1,
            width: 64,
          }),
        }
      },
      async uploadSnapshotText(reservation: MemoryRecord, text: string) {
        storageUploads.push({
          reservationId: String(reservation.id),
          text,
        })
        return `cloud://snapshot/${reservation.id}`
      },
    },
  })

  return {
    handler,
    setUser(userId: string) {
      currentUserId = userId
    },
    storageUploads,
  }
}

async function createAndFinalizeRoom(handler: ReturnType<typeof createSaierRoomApiHandler>) {
  const reserved = await handler({
    action: 'createRoomSnapshotUpload',
    appId: 'saier',
    contentType: 'application/json',
    fileName: 'first.saier.room-snapshot.json',
    format: 'saier.project',
    mode: 'viewer',
    sizeBytes: 512,
    title: 'First Room',
    visibility: 'link',
  })
  const upload = reserved.upload as { reservationId: string, storageKey: string }
  const finalized = await handler({
    action: 'finalizeRoomSnapshotUpload',
    fileId: 'cloud://snapshot-0',
    reservationId: upload.reservationId,
    roomId: (reserved.room as { id: string }).id,
    sizeBytes: 512,
    storageKey: upload.storageKey,
  })
  return { finalized, reserved }
}

describe('saier-room-api handler', () => {
  it('creates a snapshot room and lets invite viewers join read-only', async () => {
    const { handler, setUser } = createHarness()
    const { finalized, reserved } = await createAndFinalizeRoom(handler)
    const room = finalized.session?.room as { id: string }

    expect(room.id).toBe('sr_1')
    expect(finalized.session).toMatchObject({
      readOnly: false,
      role: 'owner',
      shareUrl: 'https://saier.yunle.fun/?room=sr_1&invite=rt_1',
    })
    expect(reserved.shareUrl).toBe('https://saier.yunle.fun/?room=sr_1&invite=rt_1')

    setUser('viewer')
    const joined = await handler({
      action: 'joinRoom',
      inviteToken: reserved.inviteToken,
      roomId: room.id,
    })

    expect(joined.session).toMatchObject({
      readOnly: true,
      role: 'viewer',
    })
    expect(joined.snapshot).toMatchObject({
      maxBytes: 209715200,
    })
    expect((joined.snapshot as { text: string }).text).toContain('"format":"saier.project"')
  })

  it('rejects private room joins without membership', async () => {
    const { handler, setUser } = createHarness()
    const reserved = await handler({
      action: 'createRoomSnapshotUpload',
      appId: 'saier',
      contentType: 'application/json',
      fileName: 'private.saier.room-snapshot.json',
      format: 'saier.project',
      mode: 'viewer',
      sizeBytes: 128,
      title: 'Private Room',
      visibility: 'private',
    })

    setUser('stranger')
    await expect(handler({
      action: 'joinRoom',
      roomId: (reserved.room as { id: string }).id,
    })).rejects.toMatchObject({
      reason: 'forbidden',
    })
  })

  it('finalizes initial room snapshots from function-side text uploads', async () => {
    const { handler, storageUploads } = createHarness()
    const text = JSON.stringify({
      format: 'saier.project',
      height: 64,
      layers: [],
      metadata: {},
      surfaces: [],
      version: 1,
      width: 64,
    })
    const reserved = await handler({
      action: 'createRoomSnapshotUpload',
      appId: 'saier',
      contentType: 'application/json',
      fileName: 'function-upload.saier.room-snapshot.json',
      format: 'saier.project',
      mode: 'viewer',
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      title: 'Function Upload Room',
      visibility: 'link',
    })
    const roomId = (reserved.room as { id: string }).id
    const upload = reserved.upload as { reservationId: string, storageKey: string }

    const finalized = await handler({
      action: 'finalizeRoomSnapshotText',
      reservationId: upload.reservationId,
      roomId,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      storageKey: upload.storageKey,
      text,
    })

    expect(storageUploads).toEqual([
      {
        reservationId: upload.reservationId,
        text,
      },
    ])
    expect(finalized.session).toMatchObject({
      readOnly: false,
      role: 'owner',
      room: {
        id: roomId,
        latestSnapshotRevision: 0,
      },
      shareUrl: 'https://saier.yunle.fun/?room=sr_1&invite=rt_1',
    })
  })

  it('orders committed operations and dedupes client operation ids', async () => {
    const { handler } = createHarness()
    const { finalized } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    const first = await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-a',
      clientOpId: 'op-1',
      payload: { documentId: 'doc', layerId: 'layer' },
      roomId,
      type: 'stroke:commit',
    })
    const deduped = await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-a',
      clientOpId: 'op-1',
      payload: { ignored: true },
      roomId,
      type: 'stroke:commit',
    })

    expect(first).toMatchObject({
      deduped: false,
      operation: { revision: 1 },
      room: { headRevision: 1 },
    })
    expect(deduped).toMatchObject({
      deduped: true,
      operation: { revision: 1 },
    })
    await expect(handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-a',
      clientOpId: 'op-2',
      payload: {},
      roomId,
      type: 'stroke:commit',
    })).rejects.toMatchObject({
      reason: 'revision_conflict',
    })
  })

  it('requires a snapshot refresh when clients poll behind the latest checkpoint', async () => {
    const { handler } = createHarness()
    const { finalized } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-a',
      clientOpId: 'op-1',
      payload: { documentId: 'doc', layerId: 'layer' },
      roomId,
      type: 'stroke:commit',
    })
    const reserved = await handler({
      action: 'createSnapshotUpload',
      appId: 'saier',
      contentType: 'application/json',
      fileName: 'checkpoint.saier.room-snapshot.json',
      format: 'saier.project',
      roomId,
      sizeBytes: 512,
    })
    const upload = reserved.upload as { reservationId: string, storageKey: string }
    await handler({
      action: 'finalizeSnapshotUpload',
      fileId: 'cloud://snapshot-1',
      reservationId: upload.reservationId,
      roomId,
      sizeBytes: 512,
      storageKey: upload.storageKey,
    })
    await handler({
      action: 'appendOperation',
      baseRevision: 1,
      clientId: 'client-a',
      clientOpId: 'op-2',
      payload: { command: 'set-visible' },
      roomId,
      type: 'layer:command',
    })

    const listed = await handler({
      action: 'listOperations',
      afterRevision: 0,
      limit: 10,
      roomId,
    })

    expect(listed).toMatchObject({
      nextRevision: 2,
      snapshotRequired: true,
      snapshotRevision: 1,
    })
    expect((listed.items as Array<{ revision: number }>).map(item => item.revision)).toEqual([2])
    expect((listed.snapshot as { text: string }).text).toContain('"format":"saier.project"')
  })

  it('finalizes checkpoint snapshots from function-side text uploads', async () => {
    const { handler, storageUploads } = createHarness()
    const { finalized } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-a',
      clientOpId: 'op-1',
      payload: { command: 'set-visible' },
      roomId,
      type: 'layer:command',
    })

    const text = JSON.stringify({
      format: 'saier.project',
      height: 64,
      layers: [],
      metadata: {},
      surfaces: [],
      version: 1,
      width: 64,
    })
    const reserved = await handler({
      action: 'createSnapshotUpload',
      appId: 'saier',
      contentType: 'application/json',
      fileName: 'checkpoint-text.saier.room-snapshot.json',
      format: 'saier.project',
      roomId,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
    })
    const upload = reserved.upload as { reservationId: string, storageKey: string }

    const finalizedCheckpoint = await handler({
      action: 'finalizeSnapshotText',
      reservationId: upload.reservationId,
      roomId,
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      storageKey: upload.storageKey,
      text,
    })

    expect(storageUploads.at(-1)).toEqual({
      reservationId: upload.reservationId,
      text,
    })
    expect(finalizedCheckpoint).toMatchObject({
      room: {
        id: roomId,
        latestSnapshotRevision: 1,
      },
      snapshot: {
        revision: 1,
      },
    })
  })

  it('updates member presence and returns the refreshed member list', async () => {
    const { handler, setUser } = createHarness()
    const { finalized, reserved } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    setUser('viewer')
    await handler({
      action: 'joinRoom',
      inviteToken: reserved.inviteToken,
      roomId,
    })

    const updated = await handler({
      action: 'updatePresence',
      presence: {
        activeLayerId: 'ink',
        tool: 'brush',
      },
      roomId,
    })

    expect(updated).toMatchObject({
      ok: true,
      room: { id: roomId },
    })
    expect(updated.members).toContainEqual(expect.objectContaining({
      online: true,
      presence: {
        activeLayerId: 'ink',
        tool: 'brush',
      },
      role: 'viewer',
      userId: 'viewer',
    }))
  })

  it('lets owners grant editor role before multi-editor writes', async () => {
    const { handler, setUser } = createHarness()
    const { finalized, reserved } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    setUser('viewer')
    await handler({
      action: 'joinRoom',
      inviteToken: reserved.inviteToken,
      roomId,
    })
    await expect(handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-b',
      clientOpId: 'op-viewer',
      payload: {},
      roomId,
      type: 'layer:command',
    })).rejects.toMatchObject({
      reason: 'forbidden',
    })

    setUser('owner')
    await handler({
      action: 'setMemberRole',
      role: 'editor',
      roomId,
      userId: 'viewer',
    })
    await handler({
      action: 'setRoomMode',
      mode: 'multi-editor',
      roomId,
    })

    setUser('viewer')
    const operation = await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-b',
      clientOpId: 'op-editor',
      payload: { command: 'layer:add' },
      roomId,
      type: 'layer:command',
    })
    expect(operation).toMatchObject({
      operation: {
        revision: 1,
        type: 'layer:command',
        userId: 'viewer',
      },
    })
  })
})
