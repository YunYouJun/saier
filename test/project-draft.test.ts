import type { SaierProjectFile } from '@saier/core'
import type { ProjectDraftStore } from '../site/app/utils/projectDraft'
import { SAIER_PROJECT_FORMAT } from '@saier/core'
import { describe, expect, it } from 'vitest'
import {
  clearProjectDraft,
  createProjectDraft,
  parseProjectDraftText,
  readProjectDraft,
  SAIER_PROJECT_DRAFT_FORMAT,
  serializeProjectDraft,
  writeProjectDraft,
} from '../site/app/utils/projectDraft'

const PROJECT: SaierProjectFile = {
  format: SAIER_PROJECT_FORMAT,
  version: 2,
  width: 64,
  height: 64,
  tileSize: 256,
  activeLayerId: 'layer-1',
  metadata: {
    name: 'Draft',
  },
  layerTree: [],
  layers: [],
  surfaces: [],
}

describe('local project draft file', () => {
  it('serializes and parses project drafts', () => {
    const draft = createProjectDraft(PROJECT, 1234)
    const parsed = parseProjectDraftText(serializeProjectDraft(draft))

    expect(parsed).toMatchObject({
      format: SAIER_PROJECT_DRAFT_FORMAT,
      updatedAt: 1234,
      project: {
        format: SAIER_PROJECT_FORMAT,
        metadata: {
          name: 'Draft',
        },
      },
    })
  })

  it('rejects invalid draft payloads', () => {
    expect(parseProjectDraftText(JSON.stringify({
      format: 'wrong',
      version: 1,
      updatedAt: 1,
      project: PROJECT,
    }))).toBeUndefined()

    expect(parseProjectDraftText(JSON.stringify({
      format: SAIER_PROJECT_DRAFT_FORMAT,
      version: 1,
      updatedAt: 1,
      project: {
        ...PROJECT,
        format: 'wrong',
      },
    }))).toBeUndefined()

    expect(parseProjectDraftText('{')).toBeUndefined()
  })

  it('reads, writes, and clears the local IndexedDB draft store', async () => {
    const store = new MemoryProjectDraftStore()
    const draft = createProjectDraft(PROJECT, 5678)

    await writeProjectDraft(draft, store)

    expect(store.value).toMatchObject({ format: SAIER_PROJECT_DRAFT_FORMAT })
    expect((await readProjectDraft(store))?.updatedAt).toBe(5678)

    await clearProjectDraft(store)

    expect(await readProjectDraft(store)).toBeUndefined()
  })
})

class MemoryProjectDraftStore implements ProjectDraftStore {
  value: unknown

  async read(): Promise<unknown | undefined> {
    return this.value
  }

  async write(draft: unknown): Promise<void> {
    this.value = draft
  }

  async clear(): Promise<void> {
    this.value = undefined
  }
}
