const process = require('node:process')
const cloudbase = require('@cloudbase/node-sdk')
const { createActivityCommandService } = require('./activity-command-service.cjs')
const {
  createActivityDeadlineWorker,
  isActivityDeadlineTimerEvent,
} = require('./activity-workers.cjs')
const {
  createCloudbaseCollectionStore,
  createCloudbaseSnapshotStorage,
  getCloudbaseCallerUid,
} = require('./cloudbase-runtime.cjs')
const { createSaierRoomApiHandler } = require('./handler.cjs')

const ACTIVITY_DEADLINE_TRIGGER = 'saier-activity-deadlines'

const COLLECTIONS = {
  activityCanvasOperations: 'saier_room_game_canvas_operations',
  activityCommands: 'saier_room_game_commands',
  activityEvents: 'saier_room_game_events',
  activityOutbox: 'saier_room_game_outbox',
  activitySecrets: 'saier_room_game_secrets',
  activitySessions: 'saier_room_game_sessions',
  activitySnapshots: 'saier_room_game_snapshots',
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
const repo = createCloudbaseCollectionStore(db, COLLECTIONS)
const activityService = createActivityCommandService({ repo })
const deadlineWorker = createActivityDeadlineWorker({
  commandService: activityService,
  repo,
})

const handler = createSaierRoomApiHandler({
  activityService,
  envId: process.env.SAIER_REALTIME_ENV_ID ?? process.env.TCB_ENV,
  getCurrentUserId,
  realtimeTokenSecret: process.env.SAIER_REALTIME_TOKEN_SECRET,
  repo,
  shareOrigin: process.env.SAIER_ROOM_SHARE_ORIGIN,
  storage: createCloudbaseSnapshotStorage(app),
})

exports.main = async (event, context) => {
  try {
    if (isActivityDeadlineTimerEvent(event, ACTIVITY_DEADLINE_TRIGGER)) {
      const processed = await deadlineWorker.scanDue(25)
      return { processed: processed.length }
    }
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
