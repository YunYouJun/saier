const process = require('node:process')
const cloudbase = require('@cloudbase/node-sdk')
const {
  createCloudbaseCollectionStore,
  createCloudbaseSnapshotStorage,
  getCloudbaseCallerUid,
} = require('./cloudbase-runtime.cjs')
const { createSaierRoomApiHandler } = require('./handler.cjs')

const COLLECTIONS = {
  members: 'saier_room_members',
  operations: 'saier_room_operations',
  reservations: 'saier_room_snapshot_reservations',
  rooms: 'saier_room_rooms',
  snapshots: 'saier_room_snapshots',
}
const app = cloudbase.init({
  env: cloudbase.SYMBOL_CURRENT_ENV,
})
const db = app.database()

const handler = createSaierRoomApiHandler({
  getCurrentUserId,
  repo: createCloudbaseCollectionStore(db, COLLECTIONS),
  shareOrigin: process.env.SAIER_ROOM_SHARE_ORIGIN,
  storage: createCloudbaseSnapshotStorage(app),
})

exports.main = async (event, context) => {
  try {
    return await handler(event, context)
  }
  catch (error) {
    console.error('[saier-room-api] failed:', event?.action, error instanceof Error ? error.message : error)
    throw error
  }
}

function getCurrentUserId() {
  return getCloudbaseCallerUid(app)
}
