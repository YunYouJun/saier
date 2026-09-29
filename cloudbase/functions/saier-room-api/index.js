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
const {
  createPictionaryAiAudit,
  createPictionaryAiUsageLimiter,
  parseDailyLimit,
} = require('./pictionary-ai-guardrails.cjs')
const {
  createCloudbasePictionaryAiGenerator,
  createCloudbasePictionaryImageImporter,
  createPictionaryAiRemixService,
} = require('./pictionary-ai-remix.cjs')
const { createPlayPictionaryTicketService } = require('./play-pictionary-ticket.cjs')

const ACTIVITY_DEADLINE_TRIGGER = 'saier-activity-deadlines'

const COLLECTIONS = {
  activityCanvasOperations: 'saier_room_game_canvas_operations',
  activityCommands: 'saier_room_game_commands',
  activityEvents: 'saier_room_game_events',
  activityOutbox: 'saier_room_game_outbox',
  activitySecrets: 'saier_room_game_secrets',
  activitySessions: 'saier_room_game_sessions',
  activitySnapshots: 'saier_room_game_snapshots',
  aiUsage: 'saier_room_ai_usage',
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
const aiRemixEnabled = process.env.SAIER_AI_PICTIONARY_ENABLED === 'true'
const aiRemixAllowlist = new Set((process.env.SAIER_AI_PICTIONARY_ALLOWLIST ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean))
const aiRemixOptions = {
  audit: createPictionaryAiAudit({
    sink: record => process.stdout.write(`[saier-room-api] pictionary-ai ${JSON.stringify(record)}\n`),
  }),
  commandService: activityService,
  enabled: aiRemixEnabled,
  isUserAllowed: userId => aiRemixAllowlist.has('*') || aiRemixAllowlist.has(userId),
  repo,
  usageLimiter: createPictionaryAiUsageLimiter({
    globalDailyLimit: parseDailyLimit(process.env.SAIER_AI_PICTIONARY_GLOBAL_DAILY_LIMIT, 30, 'SAIER_AI_PICTIONARY_GLOBAL_DAILY_LIMIT'),
    repo,
    userDailyLimit: parseDailyLimit(process.env.SAIER_AI_PICTIONARY_USER_DAILY_LIMIT, 3, 'SAIER_AI_PICTIONARY_USER_DAILY_LIMIT'),
  }),
}
const aiRemixService = createPictionaryAiRemixService({
  ...aiRemixOptions,
  imageGenerator: createCloudbasePictionaryAiGenerator({
    adapter: process.env.SAIER_AI_PICTIONARY_IMAGE_ADAPTER,
    app,
    model: process.env.SAIER_AI_PICTIONARY_IMAGE_MODEL,
    provider: process.env.SAIER_AI_PICTIONARY_IMAGE_PROVIDER,
  }),
})
const localAiRemixService = createPictionaryAiRemixService({
  ...aiRemixOptions,
  enabled: aiRemixEnabled && process.env.SAIER_AI_PICTIONARY_LOCAL_IMPORT_ENABLED === 'true',
  imageGenerator: createCloudbasePictionaryImageImporter({ app }),
})
const deadlineWorker = createActivityDeadlineWorker({
  commandService: activityService,
  repo,
})

const handler = createSaierRoomApiHandler({
  activityService,
  aiRemixService,
  localAiRemixService,
  envId: process.env.SAIER_REALTIME_ENV_ID ?? process.env.TCB_ENV,
  getCurrentUserId,
  realtimeTokenSecret: process.env.SAIER_REALTIME_TOKEN_SECRET,
  playPictionaryTickets: createPlayPictionaryTicketService({
    apiBaseUrl: process.env.PLAY_GAME_SERVER_API_URL,
    realtimeUrl: process.env.PLAY_GAME_SERVER_REALTIME_URL,
    token: process.env.SAIER_PICTIONARY_REALTIME_TOKEN,
  }),
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
