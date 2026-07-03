import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readRepoFile(path: string): string {
  return readFileSync(resolve(rootDir, path), 'utf8')
}

describe('brush cloud storage contract', () => {
  it('keeps brush sync on generic user-storage-api actions', () => {
    const composable = readRepoFile('site/app/composables/useYunlefunBrushLibrary.ts')

    expect(composable).toContain('USER_STORAGE_API_FUNCTION_NAME = \'user-storage-api\'')
    expect(composable).toContain('callUserStorageApi(\'listStorageFiles\'')
    expect(composable).toContain('callUserStorageApi(\'reserveStorageUpload\'')
    expect(composable).toContain('callUserStorageApi(\'finalizeStorageUpload\'')
    expect(composable).toContain('kind: BRUSH_LIBRARY_KIND')
    expect(composable).toContain('slotKey: BRUSH_LIBRARY_SLOT_KEY')

    expect(composable).not.toContain('account-api')
    expect(composable).not.toContain('callAccountApi')
    expect(composable).not.toContain('getBrushLibraryFile')
    expect(composable).not.toContain('reserveBrushLibraryUpload')
    expect(composable).not.toContain('finalizeBrushLibraryUpload')
  })

  it('keeps project sync on the same user-storage-api boundary', () => {
    const composable = readRepoFile('site/app/composables/useYunlefunCloudFiles.ts')

    expect(composable).toContain('USER_STORAGE_API_FUNCTION_NAME = \'user-storage-api\'')
    expect(composable).toContain('callUserStorageApi(\'getStorageQuota\'')
    expect(composable).toContain('callUserStorageApi(\'listStorageFiles\'')
    expect(composable).toContain('callUserStorageApi(\'reserveStorageUpload\'')
    expect(composable).toContain('callUserStorageApi(\'finalizeStorageUpload\'')
    expect(composable).toContain('callUserStorageApi(\'deleteStorageFile\'')
    expect(composable).toContain('kind: \'project\'')

    expect(composable).not.toContain('account-api')
    expect(composable).not.toContain('callAccountApi')
  })

  it('documents app/kind policy on user-storage-api instead of brush-specific backend actions', () => {
    const task = readRepoFile('docs/design/tasks/P10-01-brush-cloud-sync.md')
    const rules = readRepoFile('cloudbase/security-rules/README.md')
    const combined = `${task}\n${rules}`

    expect(combined).toContain('user-storage-api')
    expect(combined).toContain('kind: \'brush-library\'')
    expect(combined).toContain('slotKey: \'default\'')
    expect(combined).toContain('singletonBy')
    expect(combined).toContain('must not parse `saier.brush-library.v1`')

    expect(combined).not.toContain('getBrushLibraryFile')
    expect(combined).not.toContain('reserveBrushLibraryUpload')
    expect(combined).not.toContain('finalizeBrushLibraryUpload')
  })
})
