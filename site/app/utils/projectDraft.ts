import type { SaierProjectFile } from '@saier/core'
import { SAIER_PROJECT_FORMAT } from '@saier/core'

export const SAIER_PROJECT_DRAFT_FORMAT = 'saier.project-draft.v1'
export const SAIER_PROJECT_DRAFT_VERSION = 1
export const SAIER_PROJECT_DRAFT_DATABASE_NAME = 'saier'
export const SAIER_PROJECT_DRAFT_DATABASE_VERSION = 1
export const SAIER_PROJECT_DRAFT_STORE_NAME = 'project-drafts'
export const SAIER_PROJECT_DRAFT_RECORD_ID = 'current'
export const SAIER_PROJECT_DRAFT_LEGACY_STORAGE_KEY = 'saier:project-draft:v1'

export interface SaierProjectDraftFile {
  format: typeof SAIER_PROJECT_DRAFT_FORMAT
  version: typeof SAIER_PROJECT_DRAFT_VERSION
  updatedAt: number
  project: SaierProjectFile
}

export interface ProjectDraftStore {
  read: () => Promise<unknown | undefined>
  write: (draft: SaierProjectDraftFile) => Promise<void>
  clear: () => Promise<void>
}

interface ProjectDraftRecord {
  id: typeof SAIER_PROJECT_DRAFT_RECORD_ID
  draft: SaierProjectDraftFile
}

export function createProjectDraft(project: SaierProjectFile, updatedAt = Date.now()): SaierProjectDraftFile {
  return {
    format: SAIER_PROJECT_DRAFT_FORMAT,
    version: SAIER_PROJECT_DRAFT_VERSION,
    updatedAt,
    project,
  }
}

export function serializeProjectDraft(draft: SaierProjectDraftFile): string {
  return JSON.stringify(draft)
}

export function parseProjectDraftText(text: string): SaierProjectDraftFile | undefined {
  try {
    return parseProjectDraft(JSON.parse(text))
  }
  catch {
    return undefined
  }
}

export async function readProjectDraft(store: ProjectDraftStore = createIndexedDbProjectDraftStore()): Promise<SaierProjectDraftFile | undefined> {
  return parseProjectDraft(await store.read())
}

export async function writeProjectDraft(
  draft: SaierProjectDraftFile,
  store: ProjectDraftStore = createIndexedDbProjectDraftStore(),
): Promise<void> {
  await store.write(draft)
}

export async function clearProjectDraft(store: ProjectDraftStore = createIndexedDbProjectDraftStore()): Promise<void> {
  await store.clear()
}

export function createIndexedDbProjectDraftStore(options: {
  indexedDb?: IDBFactory
  legacyStorage?: Storage
} = {}): ProjectDraftStore {
  const indexedDb = options.indexedDb ?? globalThis.indexedDB
  const legacyStorage = options.legacyStorage ?? safeLegacyStorage()

  return {
    async read() {
      const record = await readIndexedDbProjectDraft(indexedDb)
      if (record)
        return record

      const legacyDraft = readLegacyProjectDraft(legacyStorage)
      if (!legacyDraft)
        return undefined

      await writeIndexedDbProjectDraft(indexedDb, legacyDraft)
      legacyStorage?.removeItem(SAIER_PROJECT_DRAFT_LEGACY_STORAGE_KEY)
      return legacyDraft
    },
    async write(draft) {
      await writeIndexedDbProjectDraft(indexedDb, draft)
      legacyStorage?.removeItem(SAIER_PROJECT_DRAFT_LEGACY_STORAGE_KEY)
    },
    async clear() {
      await clearIndexedDbProjectDraft(indexedDb)
      legacyStorage?.removeItem(SAIER_PROJECT_DRAFT_LEGACY_STORAGE_KEY)
    },
  }
}

async function readIndexedDbProjectDraft(indexedDb: IDBFactory | undefined): Promise<unknown | undefined> {
  const database = await openProjectDraftDatabase(indexedDb)
  try {
    const transaction = database.transaction(SAIER_PROJECT_DRAFT_STORE_NAME, 'readonly')
    const done = transactionDone(transaction)
    const record = await requestResult<ProjectDraftRecord | undefined>(
      transaction.objectStore(SAIER_PROJECT_DRAFT_STORE_NAME).get(SAIER_PROJECT_DRAFT_RECORD_ID),
    )
    await done
    return record?.draft
  }
  finally {
    database.close()
  }
}

async function writeIndexedDbProjectDraft(indexedDb: IDBFactory | undefined, draft: SaierProjectDraftFile): Promise<void> {
  const database = await openProjectDraftDatabase(indexedDb)
  try {
    const transaction = database.transaction(SAIER_PROJECT_DRAFT_STORE_NAME, 'readwrite')
    const done = transactionDone(transaction)
    transaction.objectStore(SAIER_PROJECT_DRAFT_STORE_NAME).put({
      id: SAIER_PROJECT_DRAFT_RECORD_ID,
      draft,
    } satisfies ProjectDraftRecord)
    await done
  }
  finally {
    database.close()
  }
}

async function clearIndexedDbProjectDraft(indexedDb: IDBFactory | undefined): Promise<void> {
  const database = await openProjectDraftDatabase(indexedDb)
  try {
    const transaction = database.transaction(SAIER_PROJECT_DRAFT_STORE_NAME, 'readwrite')
    const done = transactionDone(transaction)
    transaction.objectStore(SAIER_PROJECT_DRAFT_STORE_NAME).delete(SAIER_PROJECT_DRAFT_RECORD_ID)
    await done
  }
  finally {
    database.close()
  }
}

function openProjectDraftDatabase(indexedDb: IDBFactory | undefined): Promise<IDBDatabase> {
  if (!indexedDb)
    return Promise.reject(new Error('IndexedDB is not available.'))

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(SAIER_PROJECT_DRAFT_DATABASE_NAME, SAIER_PROJECT_DRAFT_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SAIER_PROJECT_DRAFT_STORE_NAME))
        database.createObjectStore(SAIER_PROJECT_DRAFT_STORE_NAME, { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error ?? new Error('Failed to open project draft database.'))
    request.onsuccess = () => resolve(request.result)
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

function readLegacyProjectDraft(storage: Storage | undefined): SaierProjectDraftFile | undefined {
  const text = storage?.getItem(SAIER_PROJECT_DRAFT_LEGACY_STORAGE_KEY)
  return text ? parseProjectDraftText(text) : undefined
}

function safeLegacyStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  }
  catch {
    return undefined
  }
}

function parseProjectDraft(value: unknown): SaierProjectDraftFile | undefined {
  const record = asRecord(value)
  if (!record || record.format !== SAIER_PROJECT_DRAFT_FORMAT || record.version !== SAIER_PROJECT_DRAFT_VERSION)
    return undefined

  const updatedAt = numberValue(record.updatedAt)
  const project = parseProjectFile(record.project)
  if (updatedAt === undefined || !project)
    return undefined

  return {
    format: SAIER_PROJECT_DRAFT_FORMAT,
    version: SAIER_PROJECT_DRAFT_VERSION,
    updatedAt,
    project,
  }
}

function parseProjectFile(value: unknown): SaierProjectFile | undefined {
  const record = asRecord(value)
  if (!record
    || record.format !== SAIER_PROJECT_FORMAT
    || typeof record.width !== 'number'
    || typeof record.height !== 'number'
    || !Array.isArray(record.layers)
    || !Array.isArray(record.surfaces)) {
    return undefined
  }

  return record as unknown as SaierProjectFile
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
