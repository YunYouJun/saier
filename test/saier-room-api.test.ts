import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSaierRoomApiHandler } = require('../cloudbase/functions/saier-room-api/handler.cjs') as {
  createSaierRoomApiHandler: (options: RoomApiTestOptions) => (event: Record<string, unknown>, context?: Record<string, unknown>) => Promise<Record<string, unknown>>
}

interface RoomApiTestOptions {
  envId?: string
  getCurrentUserId: () => Promise<string> | string
  hash: (value: string) => string
  now: () => number
  randomId: (prefix: string) => string
  realtimeTokenSecret?: string
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
  private readonly activityCanvasOperations = new Map<string, MemoryRecord>()
  private readonly activityCommands = new Map<string, MemoryRecord>()
  private readonly activityEvents = new Map<string, MemoryRecord>()
  private readonly activityOutbox = new Map<string, MemoryRecord>()
  private readonly activitySecrets = new Map<string, MemoryRecord>()
  private readonly activitySessions = new Map<string, MemoryRecord>()
  private transactionQueue = Promise.resolve()

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

  async getMemberByRoomAndUser(roomId: string, userId: string): Promise<MemoryRecord | undefined> {
    return this.getMember(roomId, userId)
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

  async getActivitySession(id: string): Promise<MemoryRecord | undefined> {
    return this.clone(this.activitySessions.get(id))
  }

  async getActivitySecret(id: string): Promise<MemoryRecord | undefined> {
    return this.clone(this.activitySecrets.get(id))
  }

  async listActivityEvents(sessionId: string, afterEventSeq: number, limit: number): Promise<MemoryRecord[]> {
    return this.findMany(this.activityEvents, record => record.sessionId === sessionId && Number(record.eventSeq) > afterEventSeq)
      .sort((a, b) => Number(a.eventSeq) - Number(b.eventSeq))
      .slice(0, limit)
  }

  async listActivityCanvasOperations(sessionId: string, roundId: string, afterCanvasSeq: number, limit: number): Promise<MemoryRecord[]> {
    return this.findMany(this.activityCanvasOperations, record => record.sessionId === sessionId && record.roundId === roundId && Number(record.canvasSeq) > afterCanvasSeq)
      .sort((a, b) => Number(a.canvasSeq) - Number(b.canvasSeq))
      .slice(0, limit)
  }

  async listDueActivitySessions(now: number, limit: number): Promise<MemoryRecord[]> {
    return this.findMany(this.activitySessions, record => record.status === 'active' && Number(record.deadlineAt) <= now)
      .sort((a, b) => Number(a.deadlineAt) - Number(b.deadlineAt))
      .slice(0, limit)
  }

  inspectActivityRecords(): Record<string, MemoryRecord[]> {
    return {
      canvasOperations: this.findMany(this.activityCanvasOperations, () => true),
      commands: this.findMany(this.activityCommands, () => true),
      events: this.findMany(this.activityEvents, () => true),
      outbox: this.findMany(this.activityOutbox, () => true),
      secrets: this.findMany(this.activitySecrets, () => true),
      sessions: this.findMany(this.activitySessions, () => true),
    }
  }

  async runActivityTransaction<T>(update: (tx: MemoryActivityTransaction) => Promise<T>): Promise<T> {
    let release: (() => void) | undefined
    const previous = this.transactionQueue
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const staged = {
        activityCanvasOperations: cloneMap(this.activityCanvasOperations),
        activityCommands: cloneMap(this.activityCommands),
        activityEvents: cloneMap(this.activityEvents),
        activityOutbox: cloneMap(this.activityOutbox),
        activitySecrets: cloneMap(this.activitySecrets),
        activitySessions: cloneMap(this.activitySessions),
        members: cloneMap(this.members),
        rooms: cloneMap(this.rooms),
      }
      const tx = createMemoryActivityTransaction(staged)
      const result = await update(tx)
      replaceMap(this.activityCanvasOperations, staged.activityCanvasOperations)
      replaceMap(this.activityCommands, staged.activityCommands)
      replaceMap(this.activityEvents, staged.activityEvents)
      replaceMap(this.activityOutbox, staged.activityOutbox)
      replaceMap(this.activitySecrets, staged.activitySecrets)
      replaceMap(this.activitySessions, staged.activitySessions)
      replaceMap(this.members, staged.members)
      replaceMap(this.rooms, staged.rooms)
      return result
    }
    finally {
      release?.()
    }
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
    return record ? structuredClone(record) : undefined
  }
}

interface MemoryActivityTransaction {
  getActivityCanvasOperation: (id: string) => Promise<MemoryRecord | undefined>
  getActivityCommand: (id: string) => Promise<MemoryRecord | undefined>
  getActivitySecret: (id: string) => Promise<MemoryRecord | undefined>
  getActivitySession: (id: string) => Promise<MemoryRecord | undefined>
  getMember: (id: string) => Promise<MemoryRecord | undefined>
  getRoom: (id: string) => Promise<MemoryRecord | undefined>
  setActivityCanvasOperation: (id: string, doc: MemoryRecord) => Promise<void>
  setActivityCommand: (id: string, doc: MemoryRecord) => Promise<void>
  setActivityEvent: (id: string, doc: MemoryRecord) => Promise<void>
  setActivityOutbox: (id: string, doc: MemoryRecord) => Promise<void>
  setActivitySecret: (id: string, doc: MemoryRecord) => Promise<void>
  setActivitySession: (id: string, doc: MemoryRecord) => Promise<void>
  setMember: (id: string, doc: MemoryRecord) => Promise<void>
  setRoom: (id: string, doc: MemoryRecord) => Promise<void>
}

type ActivityMaps = Record<string, Map<string, MemoryRecord>>

function createMemoryActivityTransaction(maps: ActivityMaps): MemoryActivityTransaction {
  const get = (map: Map<string, MemoryRecord>, id: string) => Promise.resolve(map.has(id) ? structuredClone(map.get(id)!) : undefined)
  const set = (map: Map<string, MemoryRecord>, id: string, doc: MemoryRecord) => {
    map.set(id, structuredClone({ ...doc, id }))
    return Promise.resolve()
  }
  return {
    getActivityCanvasOperation: id => get(maps.activityCanvasOperations!, id),
    getActivityCommand: id => get(maps.activityCommands!, id),
    getActivitySecret: id => get(maps.activitySecrets!, id),
    getActivitySession: id => get(maps.activitySessions!, id),
    getMember: id => get(maps.members!, id),
    getRoom: id => get(maps.rooms!, id),
    setActivityCanvasOperation: (id, doc) => set(maps.activityCanvasOperations!, id, doc),
    setActivityCommand: (id, doc) => set(maps.activityCommands!, id, doc),
    setActivityEvent: (id, doc) => set(maps.activityEvents!, id, doc),
    setActivityOutbox: (id, doc) => set(maps.activityOutbox!, id, doc),
    setActivitySecret: (id, doc) => set(maps.activitySecrets!, id, doc),
    setActivitySession: (id, doc) => set(maps.activitySessions!, id, doc),
    setMember: (id, doc) => set(maps.members!, id, doc),
    setRoom: (id, doc) => set(maps.rooms!, id, doc),
  }
}

function cloneMap(source: Map<string, MemoryRecord>): Map<string, MemoryRecord> {
  return new Map(Array.from(source, ([id, value]) => [id, structuredClone(value)]))
}

function replaceMap(target: Map<string, MemoryRecord>, source: Map<string, MemoryRecord>): void {
  target.clear()
  for (const [id, value] of source)
    target.set(id, structuredClone(value))
}

function createHarness(initialUserId = 'owner') {
  let currentUserId = initialUserId
  let currentTime = 1000
  const counters = new Map<string, number>()
  const repo = new MemoryRoomRepository()
  const storageUploads: Array<{ reservationId: string, text: string }> = []
  const handler = createSaierRoomApiHandler({
    envId: 'test-env',
    getCurrentUserId: () => currentUserId,
    hash: value => `hash:${value}`,
    now: () => currentTime++,
    randomId(prefix: string) {
      const next = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, next)
      return `${prefix}_${next}`
    },
    realtimeTokenSecret: 'test-realtime-secret',
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
    repo,
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
  it('creates lightweight activity rooms without a project snapshot', async () => {
    const { handler, setUser } = createHarness()
    const created = await handler({
      action: 'createActivityRoom',
      title: 'Friday Pictionary',
      visibility: 'link',
    })
    const session = created.session as {
      inviteToken: string
      room: { id: string, roomMetadataRevision: number }
      shareUrl: string
    }

    expect(session).toMatchObject({
      room: {
        id: 'sr_1',
        roomMetadataRevision: 0,
      },
      shareUrl: 'https://saier.yunle.fun/games/pictionary/sr_1?invite=rt_1',
    })

    setUser('viewer')
    const joined = await handler({
      action: 'joinActivityRoom',
      inviteToken: session.inviteToken,
      roomId: session.room.id,
    })

    expect(joined).not.toHaveProperty('snapshot')
    expect(joined.session).toMatchObject({
      readOnly: true,
      role: 'viewer',
      shareUrl: 'https://saier.yunle.fun/games/pictionary/sr_1?invite=rt_1',
    })
  })

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

  it('returns the selected driver when owners switch to driver mode', async () => {
    const { handler, setUser } = createHarness()
    const { finalized, reserved } = await createAndFinalizeRoom(handler)
    const roomId = (finalized.session?.room as { id: string }).id

    setUser('viewer')
    await handler({
      action: 'joinRoom',
      inviteToken: reserved.inviteToken,
      roomId,
    })

    setUser('owner')
    await handler({
      action: 'setMemberRole',
      role: 'editor',
      roomId,
      userId: 'viewer',
    })
    const updated = await handler({
      action: 'setRoomMode',
      driverUserId: 'viewer',
      mode: 'driver',
      roomId,
    })

    expect(updated).toMatchObject({
      room: {
        driverUserId: 'viewer',
        id: roomId,
        mode: 'driver',
      },
    })

    setUser('viewer')
    const operation = await handler({
      action: 'appendOperation',
      baseRevision: 0,
      clientId: 'client-driver',
      clientOpId: 'op-driver',
      payload: { command: 'layer:add' },
      roomId,
      type: 'layer:command',
    })
    expect(operation).toMatchObject({
      operation: {
        revision: 1,
        userId: 'viewer',
      },
    })
  })
})

describe('saier room activity authority', () => {
  it('atomically activates an activity and rejects command id payload reuse', async () => {
    const { handler, repo } = createHarness()
    const { finalized } = await createAndFinalizeRoom(handler)
    const roomId = String((finalized.session?.room as { id: string }).id)
    const request = {
      action: 'activatePictionary',
      commandId: 'activate-1',
      roomId,
      words: ['apple', 'bicycle', 'castle', 'dragon'],
    }

    const activated = await handler(request)
    const deduped = await handler(request)

    expect(activated).toMatchObject({
      activityEpoch: 1,
      eventSeq: 1,
      gameRevision: 0,
      roomMetadataRevision: 1,
    })
    expect(deduped).toMatchObject({ deduped: true, sessionId: activated.sessionId })
    expect(repo.inspectActivityRecords()).toMatchObject({
      commands: [expect.objectContaining({ payloadHash: expect.any(String) })],
      events: [expect.objectContaining({ payload: { type: 'activityCreated' } })],
      outbox: [expect.objectContaining({ publishedAt: null })],
      secrets: [expect.objectContaining({ selectedAnswer: undefined })],
      sessions: [expect.objectContaining({ phase: 'lobby' })],
    })

    const realtime = await handler({
      action: 'createActivityRealtimeToken',
      roomId,
      sessionId: activated.sessionId,
    })
    const token = String(realtime.token)
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
    expect(token.split('.')).toHaveLength(3)
    expect(claims).toMatchObject({
      activityEpoch: 1,
      aud: 'saier-realtime',
      envId: 'test-env',
      roomId,
      sessionId: activated.sessionId,
      sub: 'owner',
    })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(15 * 60)

    await expect(handler({
      ...request,
      words: ['eagle', 'forest', 'guitar'],
    })).rejects.toMatchObject({ reason: 'COMMAND_ID_REUSED' })
  })

  it('serializes HTTP/WS-equivalent duplicate commands through one dedupe record', async () => {
    const game = await createTwoPlayerActivity()
    game.setUser('viewer')
    const request = {
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'join-viewer-1',
      payload: {},
      sessionId: game.sessionId,
      type: 'joinGame',
    }

    const [httpResult, websocketResult] = await Promise.all([
      game.handler(request),
      game.handler(request),
    ])

    expect([httpResult.deduped, websocketResult.deduped].sort()).toEqual([true, undefined])
    expect(game.repo.inspectActivityRecords().commands.filter(record => record.commandId === 'join-viewer-1')).toHaveLength(1)
  })

  it('keeps guesses and answers out of durable public records and resumes by sequence', async () => {
    const game = await createDrawingActivity()
    const privateDrawer = await game.handler({
      action: 'getActivityPrivateProjection',
      activityEpoch: game.activityEpoch,
      sessionId: game.sessionId,
    })
    const answer = String(privateDrawer.answer)
    expect(answer).toBeTruthy()

    await game.handler({
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'stroke-with-untrusted-metadata',
      controllerEpoch: game.controllerEpoch,
      payload: {
        brushVersion: 'saier.activity-brush.v1',
        commit: {
          events: [{ kind: 'point', pressure: 1, t: 0, x: 8, y: 9 }],
          metadata: { privateAnswer: answer },
          schema: 'saier.stroke.v1',
        },
        strokeId: 'private-metadata-stroke',
        tool: 'pen',
      },
      phaseEpoch: game.phaseEpoch,
      roundId: game.roundId,
      sessionId: game.sessionId,
      type: 'commitStroke',
    })

    game.setUser('viewer')
    const wrong = await game.handler({
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'guess-wrong-1',
      payload: { displayText: 'not the answer' },
      phaseEpoch: game.phaseEpoch,
      roundId: game.roundId,
      sessionId: game.sessionId,
      type: 'submitGuess',
    })
    expect(wrong.transient).toMatchObject({ accepted: true, correct: false, text: 'not the answer' })

    const records = game.repo.inspectActivityRecords()
    const publicDurable = JSON.stringify({
      canvasOperations: records.canvasOperations,
      commands: records.commands,
      events: records.events,
      outbox: records.outbox,
      sessions: records.sessions,
    })
    expect(publicDurable).not.toContain(answer)
    expect(publicDurable).not.toContain('privateAnswer')
    expect(publicDurable).not.toContain('not the answer')

    const resumed = await game.handler({
      action: 'resumeActivity',
      activityEpoch: game.activityEpoch,
      cursor: {
        lastCanvasSeq: 0,
        lastEventSeq: 0,
        roomMetadataRevision: 0,
        roundId: game.roundId,
      },
      sessionId: game.sessionId,
    })
    expect(resumed.kind).toBe('SNAPSHOT_REQUIRED')
    expect(resumed.snapshot).toMatchObject({ snapshotEventSeq: expect.any(Number) })
    expect(JSON.stringify(resumed.snapshot)).not.toContain(answer)
    expect(resumed.watermark.eventSeq).toBeGreaterThan(0)

    const delta = await game.handler({
      action: 'resumeActivity',
      activityEpoch: game.activityEpoch,
      cursor: {
        lastCanvasSeq: 0,
        lastEventSeq: 1,
        roomMetadataRevision: 0,
        roundId: game.roundId,
      },
      sessionId: game.sessionId,
    })
    expect(delta).toMatchObject({
      kind: 'DELTA',
      state: { gameRevision: expect.any(Number), sessionId: game.sessionId },
    })
    expect(JSON.stringify(delta.state)).not.toContain(answer)
  })

  it('rolls back reducer failures without changing projection, secret, event, or outbox', async () => {
    const game = await createChoosingActivity()
    const before = game.repo.inspectActivityRecords()

    await expect(game.handler({
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'choose-invalid-1',
      expectedGameRevision: game.gameRevision,
      payload: { candidateIndex: 99 },
      phaseEpoch: game.phaseEpoch,
      roundId: game.roundId,
      sessionId: game.sessionId,
      type: 'chooseWord',
    })).rejects.toMatchObject({ reason: 'INVALID_CANDIDATE' })

    expect(game.repo.inspectActivityRecords()).toEqual(before)
  })

  it('assigns canvasSeq transactionally and returns explicit round resync errors', async () => {
    const game = await createDrawingActivity()
    const first = await game.handler({
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'stroke-1',
      controllerEpoch: game.controllerEpoch,
      payload: {
        brushVersion: 'saier.activity-brush.v1',
        strokeId: 'stroke-1',
        tool: 'pen',
        commit: {
          schema: 'saier.stroke.v1',
          events: [{ kind: 'point', t: 0, x: 10, y: 20, pressure: 1 }],
        },
      },
      phaseEpoch: game.phaseEpoch,
      roundId: game.roundId,
      sessionId: game.sessionId,
      type: 'commitStroke',
    })
    expect(first.canvasSeq).toBe(1)

    await expect(game.handler({
      action: 'submitActivityCommand',
      activityEpoch: game.activityEpoch,
      commandId: 'stroke-reused-with-new-command',
      controllerEpoch: game.controllerEpoch,
      payload: {
        brushVersion: 'saier.activity-brush.v1',
        strokeId: 'stroke-1',
        tool: 'pen',
        commit: {
          schema: 'saier.stroke.v1',
          events: [{ kind: 'point', t: 0, x: 10, y: 20, pressure: 1 }],
        },
      },
      phaseEpoch: game.phaseEpoch,
      roundId: game.roundId,
      sessionId: game.sessionId,
      type: 'commitStroke',
    })).rejects.toMatchObject({ reason: 'STROKE_ID_REUSED' })

    const stale = await game.handler({
      action: 'resumeActivity',
      activityEpoch: game.activityEpoch,
      cursor: {
        lastCanvasSeq: 0,
        lastEventSeq: 0,
        roomMetadataRevision: 0,
        roundId: 'stale-round',
      },
      sessionId: game.sessionId,
    })
    expect(stale).toMatchObject({ kind: 'RESYNC_REQUIRED', reason: 'ROUND_MISMATCH' })
  })
})

async function createTwoPlayerActivity() {
  const harness = createHarness()
  const { finalized, reserved } = await createAndFinalizeRoom(harness.handler)
  const roomId = String((finalized.session?.room as { id: string }).id)
  harness.setUser('viewer')
  await harness.handler({
    action: 'joinRoom',
    inviteToken: reserved.inviteToken,
    roomId,
  })
  harness.setUser('owner')
  const activated = await harness.handler({
    action: 'activatePictionary',
    commandId: 'activate-game',
    roomId,
    words: ['apple', 'bicycle', 'castle', 'dragon'],
  })
  return {
    ...harness,
    activityEpoch: Number(activated.activityEpoch),
    roomId,
    sessionId: String(activated.sessionId),
  }
}

async function createChoosingActivity() {
  const game = await createTwoPlayerActivity()
  game.setUser('viewer')
  await game.handler({
    action: 'submitActivityCommand',
    activityEpoch: game.activityEpoch,
    commandId: 'join-game-viewer',
    payload: {},
    sessionId: game.sessionId,
    type: 'joinGame',
  })
  game.setUser('owner')
  const started = await game.handler({
    action: 'submitActivityCommand',
    activityEpoch: game.activityEpoch,
    commandId: 'start-game',
    expectedGameRevision: 1,
    payload: {},
    sessionId: game.sessionId,
    type: 'startGame',
  })
  const session = await game.repo.getActivitySession(game.sessionId)
  return {
    ...game,
    controllerEpoch: Number(session?.controllerEpoch),
    gameRevision: Number(started.gameRevision),
    phaseEpoch: Number(session?.phaseEpoch),
    roundId: String(session?.round && (session.round as { roundId: string }).roundId),
  }
}

async function createDrawingActivity() {
  const game = await createChoosingActivity()
  const chosen = await game.handler({
    action: 'submitActivityCommand',
    activityEpoch: game.activityEpoch,
    commandId: 'choose-word',
    expectedGameRevision: game.gameRevision,
    payload: { candidateIndex: 0 },
    phaseEpoch: game.phaseEpoch,
    roundId: game.roundId,
    sessionId: game.sessionId,
    type: 'chooseWord',
  })
  const session = await game.repo.getActivitySession(game.sessionId)
  return {
    ...game,
    controllerEpoch: Number(session?.controllerEpoch),
    gameRevision: Number(chosen.gameRevision),
    phaseEpoch: Number(session?.phaseEpoch),
  }
}
