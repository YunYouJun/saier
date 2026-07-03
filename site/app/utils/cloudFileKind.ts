export type SaierCloudStorageFileKind = 'brush-library' | 'project'

export function normalizeSaierCloudStorageFileKind(
  kind: string | undefined,
  fileName: string,
): SaierCloudStorageFileKind | undefined {
  if (kind === 'project' || kind === 'brush-library')
    return kind
  if (kind)
    return undefined
  return /\.saier\.project\.json$/i.test(fileName) ? 'project' : undefined
}

export function isSaierProjectStorageFile(kind: SaierCloudStorageFileKind | undefined): boolean {
  return kind === 'project'
}
