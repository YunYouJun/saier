import type { DirtyRect, SaierStrokeCommit, StrokePatch, TilePatch } from '@saier/core'
import { isSaierStrokeCommit } from '@saier/core'

export const CLOUD_ROOM_STROKE_PATCH_SCHEMA = 'saier.room.stroke-patch.v1'
export const CLOUD_ROOM_STROKE_COMMIT_SCHEMA = 'saier.room.stroke-commit.v1'
export const CLOUD_ROOM_LAYER_COMMAND_SCHEMA = 'saier.room.layer-command.v1'
export const CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA = 'saier.room.document-command.v1'

export interface SerializedCloudRoomTilePatch {
  after: string
  layerId: string
  tileX: number
  tileY: number
}

export interface SerializedCloudRoomStrokePatch {
  layerId: string
  rect: DirtyRect
  schema: typeof CLOUD_ROOM_STROKE_PATCH_SCHEMA
  tiles: SerializedCloudRoomTilePatch[]
}

export interface CloudRoomStrokeCommitPayload {
  commit: SaierStrokeCommit
  patch?: SerializedCloudRoomStrokePatch
  patchHash?: string
  schema: typeof CLOUD_ROOM_STROKE_COMMIT_SCHEMA
}

export type CloudRoomLayerCommandName
  = | 'add'
    | 'add-group'
    | 'add-mask'
    | 'move'
    | 'move-node'
    | 'remove'
    | 'remove-mask'
    | 'set-blend-mode'
    | 'set-clip'
    | 'set-group-collapsed'
    | 'set-label'
    | 'set-lock-alpha'
    | 'set-mask-enabled'
    | 'set-opacity'
    | 'set-visible'
    | 'ungroup'

export interface CloudRoomLayerCommandPayload {
  args: Record<string, unknown>
  command: CloudRoomLayerCommandName
  schema: typeof CLOUD_ROOM_LAYER_COMMAND_SCHEMA
}

export type CloudRoomDocumentCommandName = 'clear-canvas'

export interface CloudRoomDocumentCommandPayload {
  args: Record<string, unknown>
  command: CloudRoomDocumentCommandName
  schema: typeof CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA
}

export function createCloudRoomClientOperationId(prefix = 'op'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `${prefix}_${crypto.randomUUID()}`
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

export function serializeCloudRoomStrokePatch(patch: StrokePatch): SerializedCloudRoomStrokePatch | undefined {
  const tiles = Array.isArray(patch.before)
    ? patch.before
    : undefined
  if (!tiles || tiles.length === 0)
    return undefined

  return {
    layerId: patch.layerId,
    rect: { ...patch.rect },
    schema: CLOUD_ROOM_STROKE_PATCH_SCHEMA,
    tiles: tiles.map(tile => ({
      after: bytesToBase64(tile.after),
      layerId: tile.layerId,
      tileX: tile.tileX,
      tileY: tile.tileY,
    })),
  }
}

export function deserializeCloudRoomStrokePatch(value: unknown): StrokePatch | undefined {
  const record = asRecord(value)
  if (!record || record.schema !== CLOUD_ROOM_STROKE_PATCH_SCHEMA)
    return undefined

  const layerId = stringValue(record.layerId)
  const rect = parseDirtyRect(record.rect)
  const tiles = arrayValue(record.tiles)
    ?.map(parseSerializedTilePatch)
    .filter(isTilePatch)
  if (!layerId || !rect || !tiles || tiles.length === 0)
    return undefined

  return {
    after: tiles,
    before: tiles,
    layerId,
    rect,
  }
}

export function createCloudRoomStrokePatchHash(patch: SerializedCloudRoomStrokePatch): string {
  let hash = 2166136261
  hash = fnv1aString(hash, patch.schema)
  hash = fnv1aString(hash, patch.layerId)
  hash = fnv1aString(hash, `${patch.rect.x},${patch.rect.y},${patch.rect.width},${patch.rect.height}`)
  for (const tile of patch.tiles) {
    hash = fnv1aString(hash, `${tile.layerId},${tile.tileX},${tile.tileY}`)
    hash = fnv1aString(hash, tile.after)
  }
  return hash.toString(16).padStart(8, '0')
}

export function createCloudRoomStrokeCommitPayload(
  commit: SaierStrokeCommit,
  patch?: StrokePatch,
): CloudRoomStrokeCommitPayload {
  const serializedPatch = patch ? serializeCloudRoomStrokePatch(patch) : undefined
  return {
    commit: cloneStrokeCommit(commit),
    ...(serializedPatch
      ? {
          patch: serializedPatch,
          patchHash: createCloudRoomStrokePatchHash(serializedPatch),
        }
      : {}),
    schema: CLOUD_ROOM_STROKE_COMMIT_SCHEMA,
  }
}

export function createCloudRoomLayerCommand(
  command: CloudRoomLayerCommandName,
  args: Record<string, unknown>,
): CloudRoomLayerCommandPayload {
  return {
    args,
    command,
    schema: CLOUD_ROOM_LAYER_COMMAND_SCHEMA,
  }
}

export function createCloudRoomDocumentCommand(
  command: CloudRoomDocumentCommandName,
  args: Record<string, unknown> = {},
): CloudRoomDocumentCommandPayload {
  return {
    args,
    command,
    schema: CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA,
  }
}

export function isCloudRoomLayerCommandPayload(value: unknown): value is CloudRoomLayerCommandPayload {
  const record = asRecord(value)
  return Boolean(record
    && record.schema === CLOUD_ROOM_LAYER_COMMAND_SCHEMA
    && typeof record.command === 'string'
    && typeof record.args === 'object'
    && record.args !== null)
}

export function isCloudRoomStrokeCommitPayload(value: unknown): value is CloudRoomStrokeCommitPayload {
  const record = asRecord(value)
  const patch = deserializeCloudRoomStrokePatch(record?.patch)
  const patchHash = stringValue(record?.patchHash)
  return Boolean(record
    && record.schema === CLOUD_ROOM_STROKE_COMMIT_SCHEMA
    && isSaierStrokeCommit(record.commit)
    && (record.patch === undefined || patch)
    && (!patch || patchHash === createCloudRoomStrokePatchHash(serializeCloudRoomStrokePatch(patch)!)))
}

export function isCloudRoomDocumentCommandPayload(value: unknown): value is CloudRoomDocumentCommandPayload {
  const record = asRecord(value)
  return Boolean(record
    && record.schema === CLOUD_ROOM_DOCUMENT_COMMAND_SCHEMA
    && record.command === 'clear-canvas'
    && typeof record.args === 'object'
    && record.args !== null)
}

function cloneStrokeCommit(commit: SaierStrokeCommit): SaierStrokeCommit {
  return JSON.parse(JSON.stringify(commit)) as SaierStrokeCommit
}

function parseSerializedTilePatch(value: unknown): TilePatch | undefined {
  const record = asRecord(value)
  const layerId = stringValue(record?.layerId)
  const tileX = integerValue(record?.tileX)
  const tileY = integerValue(record?.tileY)
  const after = typeof record?.after === 'string'
    ? base64ToBytes(record.after)
    : undefined
  if (!layerId || tileX === undefined || tileY === undefined || !after)
    return undefined

  return {
    after,
    before: new Uint8Array(after.byteLength),
    layerId,
    tileX,
    tileY,
  }
}

function parseDirtyRect(value: unknown): DirtyRect | undefined {
  const record = asRecord(value)
  const x = integerValue(record?.x)
  const y = integerValue(record?.y)
  const width = integerValue(record?.width)
  const height = integerValue(record?.height)
  return x === undefined || y === undefined || width === undefined || height === undefined
    ? undefined
    : { height, width, x, y }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index)
    return bytes
  }
  catch {
    return undefined
  }
}

function fnv1aString(seed: number, value: string): number {
  let hash = seed
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function isTilePatch(value: TilePatch | undefined): value is TilePatch {
  return Boolean(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
