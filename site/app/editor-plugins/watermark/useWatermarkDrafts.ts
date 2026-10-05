import type { WatermarkDraft, WatermarkDraftRecord, WatermarkDraftStore } from '~/features/watermark/draft'
import type { WatermarkWorkspace } from '~/features/watermark/workspace'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { createWatermarkDraftStore, recoverWatermarkDraft, watermarkDraftError } from '~/features/watermark/draft'
import { serializeWatermarkWorkfile } from '~/features/watermark/workfile'

interface DraftSession {
  id: string
  revision?: string
  fingerprint?: string
  saved?: string
  pending?: string
  generation: number
  discarding?: boolean
  timer?: ReturnType<typeof setTimeout>
  source?: ReturnType<typeof JSON.parse>
  status: string
  error?: string
}

/** Document-scoped autosave; captures an immutable workfile before async storage. */
export function useWatermarkDrafts(store: WatermarkDraftStore = createWatermarkDraftStore()) {
  const sessions = new Map<WatermarkWorkspace, DraftSession>()
  const records = shallowRef<WatermarkDraftRecord[]>([])
  const version = shallowRef(0)
  const error = shallowRef('')
  const busy = shallowRef(false)
  const ready = shallowRef(false)
  let queue = Promise.resolve()
  let disposed = false
  const notify = (): void => {
    version.value++
  }
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation)
    queue = result.then(() => {}, () => {})
    return result
  }
  const recoveries = computed(() => {
    void version.value
    const opened = new Set([...sessions.values()].map(session => session.id))
    return records.value.filter(record => !opened.has(record.id))
  })

  async function load(): Promise<void> {
    try {
      records.value = await store.list()
      error.value = ''
    }
    catch (reason) { error.value = watermarkDraftError(reason) }
    finally { ready.value = true }
  }

  function snapshot(workspace: WatermarkWorkspace) {
    const state = workspace.getState()
    return {
      name: (workspace.painter.getDocuments().find(d => d.id === workspace.documentId)?.name ?? workspace.input.preset.name).slice(0, 200),
      selected: state.layers.findIndex(layer => layer.id === state.selectedId),
      placements: workspace.getPlacements(),
      regions: workspace.input.regions,
    }
  }

  function track(workspace: WatermarkWorkspace, record?: WatermarkDraftRecord): void {
    const fingerprint = record ? JSON.stringify(snapshot(workspace)) : undefined
    sessions.set(workspace, { id: record?.id ?? crypto.randomUUID(), revision: record?.revision, fingerprint, saved: fingerprint, generation: 0, status: record ? '已恢复本地草稿' : '等待保存' })
    record ? notify() : changed(workspace)
  }

  function changed(workspace: WatermarkWorkspace): void {
    const session = sessions.get(workspace)
    if (!session || disposed || session.discarding)
      return
    const fingerprint = JSON.stringify(snapshot(workspace))
    if (fingerprint === session.fingerprint)
      return
    session.fingerprint = fingerprint
    session.status = '有更改，等待保存'
    clearTimeout(session.timer)
    session.timer = setTimeout(() => {
      void save(workspace)
    }, 700)
    notify()
  }

  async function save(workspace: WatermarkWorkspace, force = false): Promise<void> {
    const session = sessions.get(workspace)
    if (!session || session.discarding)
      return
    clearTimeout(session.timer)
    session.timer = undefined
    if (force)
      workspace.finishTransform()
    // Read this workspace's native document even when another tab is active.
    const state: ReturnType<typeof snapshot> = workspace.isActive() ? snapshot(workspace) : JSON.parse(session.fingerprint!)
    const fingerprint = JSON.stringify(state)
    if (!force && !session.pending && session.saved === fingerprint)
      return
    if (session.pending === fingerprint) {
      await queue
      return
    }
    session.pending = fingerprint
    const generation = ++session.generation
    session.status = '正在保存本地草稿…'
    session.error = undefined
    notify()
    try {
      // Sources are immutable for a workspace. Encode original PNGs only once.
      session.source ??= JSON.parse(serializeWatermarkWorkfile(workspace.input))
      const draft: WatermarkDraft = {
        format: 'saier.watermark-draft',
        version: 1,
        name: state.name,
        selected: state.selected,
        updatedAt: Date.now(),
        workfile: JSON.stringify({ ...session.source, analysis: { placements: state.placements, regions: state.regions, warnings: [] } }),
      }
      await enqueue(async () => {
        session.revision = await store.write(session.id, draft, session.revision)
        session.saved = fingerprint
        records.value = [...records.value.filter(record => record.id !== session.id), { id: session.id, revision: session.revision, current: draft }]
      })
      if (session.generation === generation)
        session.status = session.fingerprint === fingerprint ? '已保存到本机' : '有更改，等待保存'
    }
    catch (reason) {
      if (session.generation === generation) {
        session.status = '本地草稿保存失败'
        session.error = `${watermarkDraftError(reason)} 已有草稿不会被此次失败覆盖。`
      }
    }
    finally {
      if (session.generation === generation)
        session.pending = undefined
    }
    notify()
  }

  function status(workspace?: WatermarkWorkspace): DraftSession | undefined {
    void version.value
    const session = workspace ? sessions.get(workspace) : undefined
    return session ? { ...session } : undefined
  }

  async function discard(id: string): Promise<void> {
    const entry = [...sessions.entries()].find(([, session]) => session.id === id)
    if (entry) {
      entry[1].discarding = true
      clearTimeout(entry[1].timer)
      entry[1].generation++
    }
    busy.value = true
    try {
      await enqueue(async () => {
        const record = records.value.find(record => record.id === id)
        const revision = entry?.[1].revision ?? record?.revision
        if (record || revision)
          await store.remove(id, revision)
        if (entry) {
          const [workspace, session] = entry
          session.revision = undefined
          session.pending = undefined
          session.saved = session.fingerprint = JSON.stringify(snapshot(workspace))
          session.status = '本地草稿已丢弃；再次编辑后自动保存'
          session.error = undefined
        }
        records.value = records.value.filter(record => record.id !== id)
      })
      error.value = ''
    }
    catch (reason) {
      error.value = `丢弃失败：${watermarkDraftError(reason)}`
      if (entry)
        entry[1].status = '丢弃失败；本地草稿仍保留'
    }
    finally {
      if (entry) {
        entry[1].pending = undefined
        entry[1].discarding = false
      }
      busy.value = false
      notify()
    }
  }

  async function restore(record: WatermarkDraftRecord, open: (input: Awaited<ReturnType<typeof recoverWatermarkDraft>>['input'], record: WatermarkDraftRecord, draft: WatermarkDraft) => Promise<void>): Promise<void> {
    if (busy.value)
      return
    busy.value = true
    try {
      const result = await recoverWatermarkDraft(record)
      await open(result.input, record, result.draft)
      error.value = result.fallback ? '最新草稿损坏，已恢复上一份有效版本。' : ''
    }
    catch (reason) { error.value = watermarkDraftError(reason) }
    finally { busy.value = false }
  }

  function detach(workspace: WatermarkWorkspace): void {
    // Closing a document keeps its recoverable copy until explicit discard.
    void save(workspace)
    sessions.delete(workspace)
    notify()
  }
  async function flush(): Promise<void> {
    await Promise.all([...sessions.keys()].map(workspace => save(workspace)))
  }
  const hidden = (): void => {
    if (document.visibilityState === 'hidden')
      void flush()
  }
  function dispose(): void {
    if (disposed)
      return
    void flush()
    disposed = true
    for (const session of sessions.values())
      clearTimeout(session.timer)
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', hidden)
  }
  onMounted(() => {
    void load()
    document.addEventListener('visibilitychange', hidden)
  })
  onScopeDispose(dispose)
  return { recoveries, error, busy, ready, load, track, changed, save, status, discard, restore, detach, flush, dispose }
}
