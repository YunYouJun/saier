#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const DEFAULT_ENV_ID = 'yunlefun-8g7ybcxc7345c490'
const DEFAULT_ROOM_TITLE_PREFIX = 'Saier smoke '
const DEFAULT_LIMIT = 200
const USER_STORAGE_APP_ID = 'saier'

const roomCollections = [
  'saier_room_game_canvas_operations',
  'saier_room_game_commands',
  'saier_room_game_events',
  'saier_room_game_outbox',
  'saier_room_game_secrets',
  'saier_room_game_sessions',
  'saier_room_game_snapshots',
  'saier_room_operations',
  'saier_room_snapshots',
  'saier_room_snapshot_reservations',
  'saier_room_members',
]

const fallbackAccounts = [
  {
    slot: 'owner',
    uid: '2074792729263353858',
    username: 'ylf_test_saier_owner',
  },
  {
    slot: 'editor',
    uid: '2074792750494920705',
    username: 'ylf_test_saier_editor',
  },
  {
    slot: 'viewer',
    uid: '2074792769235202049',
    username: 'ylf_test_saier_viewer',
  },
  {
    slot: 'member',
    uid: '2074792789766057985',
    username: 'ylf_test_saier_member',
  },
]

const options = parseOptions(process.argv.slice(2))

if (options.help) {
  printHelp()
  process.exit(0)
}

await main()

async function main() {
  setCloudBaseEnv(options.envId)

  const accounts = await loadTestAccounts()
  const testUids = accounts.map(account => account.uid)
  const roomRows = await readRoomsByOwner(testUids)
  const rooms = roomRows.filter(room => shouldDeleteRoom(room, testUids))
  const roomIds = rooms.map(room => room.id)

  printPlan(accounts, rooms)

  const userStorageRows = options.includeUserStorage
    ? await readUserStorageRows(testUids)
    : []

  if (options.includeUserStorage)
    printUserStoragePlan(userStorageRows, testUids)

  if (!options.confirm) {
    console.log('')
    console.log('Dry run only. Re-run with --confirm to delete the listed test data.')
    return
  }

  if (roomIds.length > 0) {
    for (const collectionName of roomCollections) {
      deleteCollectionRows(collectionName, {
        roomId: { $in: roomIds },
      })
    }

    deleteCollectionRows('saier_room_rooms', {
      id: { $in: roomIds },
      ownerUserId: { $in: testUids },
    })

    for (const roomId of roomIds)
      deleteStorageDir(`room-storage/saier/${roomId}/`)
  }

  if (options.includeUserStorage) {
    for (const uid of testUids) {
      deleteCollectionRows('user_storage_files', {
        appId: USER_STORAGE_APP_ID,
        userId: uid,
      })
      deleteStorageDir(`user-storage/${uid}/${USER_STORAGE_APP_ID}/`)

      if (options.resetQuotas) {
        updateCollectionRows('user_storage_quotas', {
          _id: uid,
        }, {
          $set: {
            reservedBytes: 0,
            usedBytes: 0,
          },
        })
        updateCollectionRows('user_storage_quotas', {
          userId: uid,
        }, {
          $set: {
            reservedBytes: 0,
            usedBytes: 0,
          },
        })
      }
    }
  }

  console.log('')
  console.log('Cleanup finished.')
}

function parseOptions(argv) {
  const parsed = {
    allTestRoomData: false,
    confirm: false,
    envId: process.env.CLOUDBASE_ENV_ID || DEFAULT_ENV_ID,
    help: false,
    includeUserStorage: false,
    resetQuotas: false,
    roomTitlePrefix: DEFAULT_ROOM_TITLE_PREFIX,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--') {
      continue
    }
    else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    }
    else if (arg === '--confirm') {
      parsed.confirm = true
    }
    else if (arg === '--all-test-room-data') {
      parsed.allTestRoomData = true
    }
    else if (arg === '--include-user-storage') {
      parsed.includeUserStorage = true
    }
    else if (arg === '--reset-quotas') {
      parsed.resetQuotas = true
    }
    else if (arg === '--env-id') {
      parsed.envId = requireOptionValue(argv, index, arg)
      index += 1
    }
    else if (arg.startsWith('--env-id=')) {
      parsed.envId = arg.slice('--env-id='.length)
    }
    else if (arg === '--room-title-prefix') {
      parsed.roomTitlePrefix = requireOptionValue(argv, index, arg)
      index += 1
    }
    else if (arg.startsWith('--room-title-prefix=')) {
      parsed.roomTitlePrefix = arg.slice('--room-title-prefix='.length)
    }
    else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return parsed
}

function requireOptionValue(argv, index, optionName) {
  const value = argv[index + 1]
  if (!value)
    throw new Error(`${optionName} requires a value.`)
  return value
}

function printHelp() {
  console.log(`Usage:
  pnpm cleanup:yunlefun-test-data
  pnpm cleanup:yunlefun-test-data -- --confirm

Options:
  --confirm                Delete the listed rows and storage objects.
  --env-id <id>            CloudBase EnvId. Defaults to ${DEFAULT_ENV_ID}.
  --room-title-prefix <s>  Room title prefix to clean. Defaults to "${DEFAULT_ROOM_TITLE_PREFIX}".
  --all-test-room-data     Clean every room owned by the formal ylf_test_ Saier accounts.
  --include-user-storage   Also clean user_storage_files and user-storage/{uid}/saier/.
  --reset-quotas           With --include-user-storage, reset Saier quota counters to 0.
`)
}

function setCloudBaseEnv(envId) {
  callMcporter('cloudbase.auth', {
    action: 'set_env',
    envId,
  })
}

async function loadTestAccounts() {
  const registryRows = await safeReadCollection('yunlefun_test_accounts', {
    isTestAccount: true,
    namespace: 'saier',
    usernamePrefix: 'ylf_test_',
  })

  const registryAccounts = registryRows
    .map(toRegistryAccount)
    .filter(Boolean)

  const accountsByUsername = new Map(fallbackAccounts.map(account => [account.username, account]))

  for (const account of registryAccounts)
    accountsByUsername.set(account.username, account)

  const accounts = Array.from(accountsByUsername.values())
  const invalid = accounts.filter(account => !account.uid || !account.username.startsWith('ylf_test_'))
  if (invalid.length > 0)
    throw new Error(`Invalid test account registry rows: ${invalid.map(account => account.username).join(', ')}`)

  return accounts
}

function toRegistryAccount(row) {
  const record = toRecord(row)
  const uid = stringField(record, 'uid') || stringField(record, 'userId')
  const username = stringField(record, 'username')
  const slot = stringField(record, 'slot') || 'unknown'

  if (!uid || !username)
    return undefined

  return {
    slot,
    uid,
    username,
  }
}

async function readRoomsByOwner(uids) {
  const rows = []

  for (const uid of uids) {
    const ownedRows = await safeReadCollection('saier_room_rooms', {
      ownerUserId: uid,
    })
    rows.push(...ownedRows.map(toRoomRow).filter(Boolean))
  }

  return uniqueBy(rows, room => room.id)
}

function toRoomRow(row) {
  const record = toRecord(row)
  const id = stringField(record, 'id') || stringField(record, '_id')
  const ownerUserId = stringField(record, 'ownerUserId')
  const title = stringField(record, 'title') || ''

  if (!id || !ownerUserId)
    return undefined

  return {
    id,
    ownerUserId,
    title,
  }
}

function shouldDeleteRoom(room, testUids) {
  if (!testUids.includes(room.ownerUserId))
    return false

  if (options.allTestRoomData)
    return true

  return room.title.startsWith(options.roomTitlePrefix)
}

async function readUserStorageRows(uids) {
  const rows = []

  for (const uid of uids) {
    const fileRows = await safeReadCollection('user_storage_files', {
      appId: USER_STORAGE_APP_ID,
      userId: uid,
    })
    rows.push(...fileRows)
  }

  return rows
}

function printPlan(accounts, rooms) {
  console.log(`CloudBase EnvId: ${options.envId}`)
  console.log(`Mode: ${options.confirm ? 'confirm delete' : 'dry run'}`)
  console.log(`Room filter: ${options.allTestRoomData ? 'all rooms owned by formal ylf_test_ Saier accounts' : `title starts with "${options.roomTitlePrefix}"`}`)
  console.log('')
  console.log('Test account uid whitelist:')

  for (const account of accounts)
    console.log(`- ${account.slot}: ${account.username} (${account.uid})`)

  console.log('')
  console.log(`Rooms to delete: ${rooms.length}`)

  for (const room of rooms)
    console.log(`- ${room.id} | owner=${room.ownerUserId} | title=${room.title}`)
}

function printUserStoragePlan(rows, uids) {
  console.log('')
  console.log(`User storage rows to delete: ${rows.length}`)

  for (const uid of uids)
    console.log(`- user-storage/${uid}/${USER_STORAGE_APP_ID}/`)

  if (options.resetQuotas)
    console.log('Quota counters will be reset for the same uid whitelist.')
}

async function safeReadCollection(collectionName, query) {
  try {
    return readCollection(collectionName, query)
  }
  catch (error) {
    console.warn(`Warning: failed to read ${collectionName}: ${errorMessage(error)}`)
    return []
  }
}

function readCollection(collectionName, query) {
  const result = callMcporter('cloudbase.readNoSqlDatabaseContent', {
    collectionName,
    limit: DEFAULT_LIMIT,
    query,
  })
  const record = toRecord(result)
  const data = record.data

  if (Array.isArray(data))
    return data

  const nestedData = toRecord(data)?.data
  if (Array.isArray(nestedData))
    return nestedData

  return []
}

function deleteCollectionRows(collectionName, query) {
  console.log(`Deleting ${collectionName} rows: ${JSON.stringify(query)}`)
  callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'delete',
    collectionName,
    isMulti: true,
    query,
  })
}

function updateCollectionRows(collectionName, query, update) {
  console.log(`Updating ${collectionName} rows: ${JSON.stringify(query)}`)
  callMcporter('cloudbase.writeNoSqlDatabaseContent', {
    action: 'update',
    collectionName,
    isMulti: true,
    query,
    update,
  })
}

function deleteStorageDir(cloudPath) {
  console.log(`Deleting storage dir: ${cloudPath}`)

  try {
    callMcporter('cloudbase.manageStorage', {
      action: 'delete',
      cloudPath,
      force: true,
      isDirectory: true,
    })
  }
  catch (error) {
    console.warn(`Warning: failed to delete storage dir ${cloudPath}: ${errorMessage(error)}`)
  }
}

function callMcporter(toolName, payload) {
  const result = spawnSync('npx', [
    'mcporter',
    'call',
    toolName,
    '--args',
    JSON.stringify(payload),
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (result.status !== 0) {
    throw new Error([
      `mcporter ${toolName} failed with exit code ${result.status}`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'))
  }

  return parseMcporterOutput(result.stdout)
}

function parseMcporterOutput(output) {
  const trimmed = output.trim()
  if (!trimmed)
    return {}

  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')

  if (jsonStart < 0 || jsonEnd < jsonStart)
    return {}

  return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1))
}

function uniqueBy(items, getKey) {
  const seen = new Set()
  const result = []

  for (const item of items) {
    const key = getKey(item)
    if (seen.has(key))
      continue

    seen.add(key)
    result.push(item)
  }

  return result
}

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value
}

function stringField(record, key) {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
