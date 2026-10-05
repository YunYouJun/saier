import type { WatermarkWorkInput } from './workfile'
import { requestResult, transactionDone } from '~/utils/indexedDb'
import { watermarkObject } from './preset-contract'
import { readWatermarkWorkfile } from './workfile'

export const WATERMARK_DRAFT_DATABASE = 'saier-watermark-drafts'
export const WATERMARK_DRAFT_STORE = 'documents'

/** Layer indices survive reconstruction of the native interaction layers. */
export interface WatermarkDraft {
  format: 'saier.watermark-draft'
  version: 1
  name: string
  updatedAt: number
  workfile: string
  selected: number
}

export interface WatermarkDraftRecord {
  id: string
  revision: string
  current: unknown
  previous?: unknown
}

export interface WatermarkDraftStore {
  list: () => Promise<WatermarkDraftRecord[]>
  write: (id: string, draft: WatermarkDraft, revision?: string) => Promise<string>
  remove: (id: string, revision?: string) => Promise<void>
}

/** Validate pixels, sources and layout using the portable workfile reader. */
export async function decodeWatermarkDraft(value: unknown): Promise<{ draft: WatermarkDraft, input: WatermarkWorkInput }> {
  if (!watermarkObject(value) || value.format !== 'saier.watermark-draft' || value.version !== 1
    || typeof value.name !== 'string' || value.name.length > 200
    || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
    || typeof value.workfile !== 'string' || !Number.isInteger(value.selected) || Number(value.selected) < -1) {
    throw new Error('草稿格式损坏或版本不受支持')
  }
  const input = await readWatermarkWorkfile(new File([value.workfile], 'draft.json'))
  if (Number(value.selected) >= input.placements.length)
    throw new Error('草稿选中图层无效')
  return { draft: value as unknown as WatermarkDraft, input }
}

/** Corrupt records remain available for explicit discard; never delete on read. */
export async function recoverWatermarkDraft(record: WatermarkDraftRecord): Promise<{ draft: WatermarkDraft, input: WatermarkWorkInput, fallback: boolean }> {
  try {
    return { ...await decodeWatermarkDraft(record.current), fallback: false }
  }
  catch {
    try {
      return { ...await decodeWatermarkDraft(record.previous), fallback: true }
    }
    catch {
      throw new Error('草稿已损坏或版本不受支持，无法恢复。可丢弃此草稿并打开已下载的工作文件。')
    }
  }
}

/** Two generations are replaced in one transaction; quota/abort leaves both intact. */
export function createWatermarkDraftStore(indexedDb: IDBFactory | undefined = globalThis.indexedDB): WatermarkDraftStore {
  async function open(): Promise<IDBDatabase> {
    if (!indexedDb)
      throw new Error('此浏览器无法使用本地草稿存储')
    return new Promise((resolve, reject) => {
      let blocked = false
      const request = indexedDb.open(WATERMARK_DRAFT_DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(WATERMARK_DRAFT_STORE, { keyPath: 'id' })
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        blocked = true
        reject(new Error('草稿存储被其他页面占用，请关闭旧页面后重试'))
      }
      request.onsuccess = () => blocked ? request.result.close() : resolve(request.result)
    })
  }
  async function read(id: string): Promise<WatermarkDraftRecord | undefined> {
    const db = await open()
    try {
      const tx = db.transaction(WATERMARK_DRAFT_STORE, 'readonly')
      const [record] = await Promise.all([requestResult<WatermarkDraftRecord | undefined>(tx.objectStore(WATERMARK_DRAFT_STORE).get(id)), transactionDone(tx)])
      return record
    }
    finally { db.close() }
  }
  async function mutate(id: string, revision: string | undefined, draft?: WatermarkDraft, previous?: WatermarkDraft): Promise<string> {
    const db = await open()
    try {
      const tx = db.transaction(WATERMARK_DRAFT_STORE, 'readwrite')
      const done = transactionDone(tx)
      const store = tx.objectStore(WATERMARK_DRAFT_STORE)
      const next = crypto.randomUUID()
      let conflict = false
      let failure: unknown
      const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result as WatermarkDraftRecord | undefined
        if (record?.revision !== revision) {
          conflict = true
          tx.abort()
          return
        }
        try {
          if (draft)
            store.put({ id, revision: next, current: draft, previous } satisfies WatermarkDraftRecord)
          else
            store.delete(id)
        }
        catch (error) {
          failure = error
          tx.abort()
        }
      }
      try {
        await done
      }
      catch (error) {
        if (conflict)
          throw new Error('草稿已在其他页面更新或丢弃，请下载当前工作文件后重新打开页面')
        throw failure ?? error
      }
      return next
    }
    finally { db.close() }
  }
  return {
    async list() {
      const db = await open()
      try {
        const tx = db.transaction(WATERMARK_DRAFT_STORE, 'readonly')
        const [records] = await Promise.all([requestResult<WatermarkDraftRecord[]>(tx.objectStore(WATERMARK_DRAFT_STORE).getAll()), transactionDone(tx)])
        return records
      }
      finally { db.close() }
    },
    async write(id, draft, revision) {
      await decodeWatermarkDraft(draft)
      const record = await read(id)
      let previous: WatermarkDraft | undefined
      if (record) {
        try {
          previous = (await recoverWatermarkDraft(record)).draft
        }
        catch { /* A validated new save can replace corrupt data, only on commit. */ }
      }
      return mutate(id, revision, draft, previous)
    },
    async remove(id, revision) { await mutate(id, revision) },
  }
}

export function watermarkDraftError(error: unknown): string {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
    ? '本地存储空间不足。请下载工作文件备份，或丢弃不需要的草稿后重试。'
    : error instanceof Error ? error.message : '本地草稿操作失败，请重试或下载工作文件备份。'
}
