import { describe, expect, it } from 'vitest'
import {
  isSaierProjectStorageFile,
  normalizeSaierCloudStorageFileKind,
} from '../site/app/utils/cloudFileKind'

describe('saier cloud storage file kind', () => {
  it('keeps brush libraries out of the project file list', () => {
    expect(isSaierProjectStorageFile(normalizeSaierCloudStorageFileKind('project', 'art.saier.project.json')))
      .toBe(true)
    expect(isSaierProjectStorageFile(normalizeSaierCloudStorageFileKind('brush-library', 'brush-library.saier.brushes.json')))
      .toBe(false)
  })

  it('treats only legacy project filenames without kind as projects', () => {
    expect(normalizeSaierCloudStorageFileKind(undefined, 'legacy.saier.project.json'))
      .toBe('project')
    expect(normalizeSaierCloudStorageFileKind(undefined, 'brush-library.saier.brushes.json'))
      .toBeUndefined()
    expect(normalizeSaierCloudStorageFileKind('unexpected', 'legacy.saier.project.json'))
      .toBeUndefined()
  })
})
