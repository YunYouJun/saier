import type { SaierStrokeCommit, StrokePatch, TilePatch } from '@saier/core'
import { describe, expect, it } from 'vitest'
import {
  createCloudRoomDocumentCommand,
  createCloudRoomLayerCommand,
  createCloudRoomStrokeCommitPayload,
  createCloudRoomStrokePatchHash,
  deserializeCloudRoomStrokePatch,
  isCloudRoomDocumentCommandPayload,
  isCloudRoomLayerCommandPayload,
  isCloudRoomStrokeCommitPayload,
  serializeCloudRoomStrokePatch,
} from '../site/app/utils/cloudRoomOperations'

describe('cloud room operation payloads', () => {
  it('round-trips tiled stroke patches as JSON-safe payloads', () => {
    const patch = createPatch()
    const serialized = serializeCloudRoomStrokePatch(patch)

    expect(serialized).toMatchObject({
      layerId: 'ink',
      rect: { x: 0, y: 0, width: 16, height: 16 },
      schema: 'saier.room.stroke-patch.v1',
    })
    expect(serialized?.tiles).toHaveLength(2)

    const restored = deserializeCloudRoomStrokePatch(serialized)
    expect(restored?.layerId).toBe('ink')
    expect(restored?.rect).toEqual(patch.rect)
    expect(restored?.before).toHaveLength(2)
    expect((restored?.before as TilePatch[])[0]?.after).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect((restored?.before as TilePatch[])[1]?.after).toEqual(new Uint8Array([9, 8, 7, 6]))
  })

  it('hashes stroke patches deterministically', () => {
    const first = serializeCloudRoomStrokePatch(createPatch())
    const second = serializeCloudRoomStrokePatch(createPatch())

    expect(first && second).toBeTruthy()
    expect(createCloudRoomStrokePatchHash(first!)).toBe(createCloudRoomStrokePatchHash(second!))
  })

  it('identifies layer and document command payloads', () => {
    const layer = createCloudRoomLayerCommand('set-visible', { id: 'ink', visible: false })
    const document = createCloudRoomDocumentCommand('clear-canvas')

    expect(isCloudRoomLayerCommandPayload(layer)).toBe(true)
    expect(isCloudRoomDocumentCommandPayload(document)).toBe(true)
    expect(isCloudRoomLayerCommandPayload(document)).toBe(false)
  })

  it('wraps stroke commits with JSON-safe replay data and a patch fallback', () => {
    const patch = createPatch()
    const payload = createCloudRoomStrokeCommitPayload(createStrokeCommit(), patch)

    expect(payload).toMatchObject({
      schema: 'saier.room.stroke-commit.v1',
      commit: {
        schema: 'saier.stroke.v1',
        id: 'stroke-1',
      },
      patch: {
        schema: 'saier.room.stroke-patch.v1',
      },
    })
    expect(isCloudRoomStrokeCommitPayload(payload)).toBe(true)
  })

  it('rejects cloud stroke commit payloads with mismatched patch hashes', () => {
    const payload = createCloudRoomStrokeCommitPayload(createStrokeCommit(), createPatch())

    expect(isCloudRoomStrokeCommitPayload({
      ...payload,
      patchHash: '00000000',
    })).toBe(false)
  })
})

function createPatch(): StrokePatch {
  const tiles: TilePatch[] = [
    {
      after: new Uint8Array([1, 2, 3, 4]),
      before: new Uint8Array([0, 0, 0, 0]),
      layerId: 'ink',
      tileX: 0,
      tileY: 0,
    },
    {
      after: new Uint8Array([9, 8, 7, 6]),
      before: new Uint8Array([0, 0, 0, 0]),
      layerId: 'ink',
      tileX: 1,
      tileY: 0,
    },
  ]

  return {
    after: tiles,
    before: tiles,
    layerId: 'ink',
    rect: { x: 0, y: 0, width: 16, height: 16 },
  }
}

function createStrokeCommit(): SaierStrokeCommit {
  return {
    schema: 'saier.stroke.v1',
    id: 'stroke-1',
    documentId: 'document-1',
    layerId: 'ink',
    paintTarget: 'layer',
    tool: 'brush',
    compositeMode: 'normal',
    brushEngine: {
      id: 'simple',
      version: 'test',
    },
    brushPresetId: 'pen',
    brushPresetSnapshot: {},
    brushContextSnapshot: {
      baseSize: 8,
      color: { r: 0, g: 0, b: 0, a: 1 },
    },
    inputPipeline: 'resolved-v1',
    events: [
      { kind: 'point', t: 0, x: 4, y: 4, pressure: 1 },
    ],
  }
}
