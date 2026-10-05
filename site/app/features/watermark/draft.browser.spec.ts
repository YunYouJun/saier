import type { WatermarkDraft } from './draft'
import { afterEach, expect, it, vi } from 'vitest'
import { createWatermarkDraftStore, decodeWatermarkDraft, recoverWatermarkDraft, WATERMARK_DRAFT_DATABASE, WATERMARK_DRAFT_STORE, watermarkDraftError } from './draft'
import { compositePreset } from './preset'
import { serializeWatermarkWorkfile } from './workfile'

const store = createWatermarkDraftStore()
afterEach(async () => {
  vi.restoreAllMocks()
  for (const record of await store.list())
    await store.remove(record.id, record.revision)
})

function fixture(color = '#445566'): WatermarkDraft {
  const artwork = document.createElement('canvas')
  artwork.width = 160
  artwork.height = 120
  const ctx = artwork.getContext('2d')!
  ctx.fillStyle = '#eeeeee'
  ctx.fillRect(0, 0, 160, 120)
  ctx.clearRect(50, 30, 30, 30)
  const image = document.createElement('canvas')
  image.width = image.height = 8
  image.getContext('2d')!.fillRect(0, 0, 8, 8)
  return {
    format: 'saier.watermark-draft',
    version: 1,
    name: '含透明保护区',
    updatedAt: 100,
    selected: 0,
    workfile: serializeWatermarkWorkfile({
      artwork,
      preset: { name: 'test', rules: '保留原始像素', assets: [{ id: 'tile', role: 'repeated-watermark', width: 8, height: 8, enabled: true, recolorable: true, blendMode: 'linear-light', source: image.toDataURL(), image }] },
      placements: [{ assetId: 'tile', x: 0, y: 0, width: 0.1, rotation: 0, opacity: 0.5, color }],
      regions: [{ label: 'face', x: 0.3, y: 0.2, width: 0.2, height: 0.3 }],
    }),
  }
}

it('round-trips sources, effects, transparent protected pixels, placements and selection in independent records', async () => {
  const first = fixture()
  const second = fixture('#8899aa')
  await store.write('first', first)
  await store.write('second', second)
  const records = await store.list()
  expect(records).toHaveLength(2)
  const restored = await recoverWatermarkDraft(records.find(record => record.id === 'first')!)
  expect(restored.draft).toEqual(first)
  const before = (await decodeWatermarkDraft(first)).input
  const after = restored.input
  const render = (input: typeof before) => compositePreset(input.artwork, input.preset, input.placements, input.regions)
  expect(render(after).toDataURL()).toBe(render(before).toDataURL())
  expect(render(after).getContext('2d')!.getImageData(55, 35, 10, 10).data.every(value => value === 0)).toBe(true)
  expect((await recoverWatermarkDraft(records.find(record => record.id === 'second')!)).draft).toEqual(second)
})

it('keeps the last committed draft on transaction abort and rejects stale writes/deletes', async () => {
  const first = fixture()
  const revision = await store.write('one', first)
  const put = IDBObjectStore.prototype.put
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = put.apply(this, args)
    this.transaction.abort()
    return request
  })
  await expect(store.write('one', fixture('#8899aa'), revision)).rejects.toThrow()
  spy.mockRestore()
  expect((await recoverWatermarkDraft((await store.list())[0]!)).draft).toEqual(first)
  await expect(store.write('one', fixture(), 'stale')).rejects.toThrow('其他页面')
  await expect(store.remove('one', 'stale')).rejects.toThrow('其他页面')
  expect(watermarkDraftError(new DOMException('quota', 'QuotaExceededError'))).toContain('空间不足')
})

it('validates before replacing a record and falls back from corrupt data without deleting it', async () => {
  const first = fixture()
  const revision = await store.write('one', first)
  await expect(store.write('one', { ...first, workfile: '{}' }, revision)).rejects.toThrow()
  expect((await store.list())[0]!.current).toEqual(first)
  await store.write('one', fixture('#aabbcc'), revision)
  const record = (await store.list())[0]!
  // Simulate a damaged disk value, bypassing the application writer.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(WATERMARK_DRAFT_DATABASE, 1)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(WATERMARK_DRAFT_STORE, 'readwrite')
      tx.objectStore(WATERMARK_DRAFT_STORE).put({ ...record, current: { ...first, workfile: '{broken' } })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
  const damaged = (await store.list())[0]!
  const restored = await recoverWatermarkDraft(damaged)
  expect(restored.fallback).toBe(true)
  expect(restored.draft).toEqual(first)
  expect((await store.list())[0]).toEqual(damaged)
  await expect(recoverWatermarkDraft({ ...damaged, previous: null })).rejects.toThrow('损坏')
  // Saving after fallback must retain the valid fallback, never the damaged head.
  await store.write('one', fixture('#ddeeff'), damaged.revision)
  expect((await store.list())[0]!.previous).toEqual(first)
})
