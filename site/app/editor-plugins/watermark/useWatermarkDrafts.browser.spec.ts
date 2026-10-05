import type { WatermarkDraftRecord, WatermarkDraftStore } from '~/features/watermark/draft'
import type { WatermarkWorkspace } from '~/features/watermark/workspace'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { useWatermarkDrafts } from './useWatermarkDrafts'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()))

function setup() {
  const records = new Map<string, WatermarkDraftRecord>()
  const store: WatermarkDraftStore = {
    async list() { return [...records.values()] },
    write: vi.fn(async (id, draft, _revision) => {
      const revision = crypto.randomUUID()
      records.set(id, { id, revision, current: draft })
      return revision
    }),
    async remove(id) { records.delete(id) },
  }
  let drafts!: ReturnType<typeof useWatermarkDrafts>
  const host = document.createElement('div')
  const app = createApp({
    setup() {
      drafts = useWatermarkDrafts(store)
      return () => null
    },
  })
  app.mount(host)
  cleanup.push(() => app.unmount())
  const artwork = document.createElement('canvas')
  artwork.width = artwork.height = 10
  let color = '#112233'
  const workspace = {
    documentId: 'native-a',
    painter: { getDocuments: () => [{ id: 'native-a', name: 'A' }] },
    input: { artwork, preset: { name: 'A', rules: '', assets: [] }, regions: [], placements: [] },
    getState: () => ({ layers: [], selectedId: null }),
    getPlacements: () => [{ assetId: 'a', color }],
    isActive: () => true,
    finishTransform: () => {},
  } as unknown as WatermarkWorkspace
  drafts.track(workspace)
  return { drafts, store, workspace, records, edit: (next: string) => {
    color = next
    drafts.changed(workspace)
  } }
}

it('serializes rapid edits including returning to the saved version while another save is pending', async () => {
  const { drafts, store, workspace, records, edit } = setup()
  await drafts.save(workspace)
  const write = store.write
  let release!: () => void
  store.write = async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    store.write = write
    return write(...args)
  }
  edit('#aabbcc')
  const pending = drafts.save(workspace)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  edit('#112233')
  const latest = drafts.save(workspace)
  expect(drafts.status(workspace)?.status).toBe('正在保存本地草稿…')
  release()
  await Promise.all([pending, latest])
  const draft = [...records.values()][0]!.current as { workfile: string }
  expect(JSON.parse(draft.workfile).analysis.placements[0].color).toBe('#112233')
  expect(drafts.status(workspace)?.status).toBe('已保存到本机')
})

it('retains the committed record on failure, retries, and does not recreate a discarded draft on flush', async () => {
  const { drafts, store, workspace, records, edit } = setup()
  await drafts.save(workspace)
  const before = [...records.values()][0]
  const write = store.write
  store.write = async () => {
    throw new DOMException('full', 'QuotaExceededError')
  }
  edit('#aabbcc')
  await drafts.save(workspace)
  expect([...records.values()][0]).toEqual(before)
  expect(drafts.status(workspace)?.error).toContain('空间不足')
  store.write = write
  await drafts.save(workspace)
  expect(drafts.status(workspace)?.status).toBe('已保存到本机')
  await drafts.discard(drafts.status(workspace)!.id)
  await drafts.flush()
  expect(records.size).toBe(0)
  edit('#445566')
  await drafts.save(workspace)
  expect(records.size).toBe(1)
})

it('waits for an in-flight write before discarding and keeps a failed deletion recoverable', async () => {
  const { drafts, store, workspace, records, edit } = setup()
  await drafts.save(workspace)
  const write = store.write
  let release!: () => void
  store.write = async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return write(...args)
  }
  edit('#aabbcc')
  const pending = drafts.save(workspace)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const discard = drafts.discard(drafts.status(workspace)!.id)
  release()
  await Promise.all([pending, discard])
  await drafts.flush()
  expect(records.size).toBe(0)
  expect(drafts.status(workspace)?.status).toContain('已丢弃')
  store.write = write
  await drafts.save(workspace, true)
  store.remove = async () => {
    throw new Error('blocked')
  }
  await drafts.discard(drafts.status(workspace)!.id)
  expect(records.size).toBe(1)
  expect(drafts.error.value).toContain('丢弃失败')
})

it('ignores another autosave timer while an explicit discard is in progress', async () => {
  const { drafts, store, workspace, records, edit } = setup()
  await drafts.save(workspace)
  edit('#aabbcc')
  let release!: () => void
  const remove = store.remove
  store.remove = async (...args) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await remove(...args)
  }
  const discard = drafts.discard(drafts.status(workspace)!.id)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const autosave = drafts.save(workspace)
  release()
  await Promise.all([discard, autosave])
  await drafts.flush()
  expect(records.size).toBe(0)
})
