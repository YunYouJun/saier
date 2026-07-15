/**
 * Tracks the local document opened for each cloud project file.
 *
 * Cloud file identity is scoped to the current workspace session: reopening an
 * already-open cloud file focuses its document, while closing that document
 * allows the cloud file to be imported again.
 */
export class CloudProjectDocumentRegistry {
  private readonly documentIds = new Map<string, string>()
  private readonly loadingFileIds = new Set<string>()

  bind(fileId: string, documentId: string): void {
    this.documentIds.set(fileId, documentId)
  }

  resolve(fileId: string, openDocumentIds: Iterable<string>): string | undefined {
    const documentId = this.documentIds.get(fileId)
    if (!documentId)
      return undefined

    if (new Set(openDocumentIds).has(documentId))
      return documentId

    this.documentIds.delete(fileId)
    return undefined
  }

  unbindDocument(documentId: string): void {
    for (const [fileId, boundDocumentId] of this.documentIds) {
      if (boundDocumentId === documentId)
        this.documentIds.delete(fileId)
    }
  }

  removeFile(fileId: string): void {
    this.documentIds.delete(fileId)
    this.loadingFileIds.delete(fileId)
  }

  beginLoading(fileId: string): boolean {
    if (this.loadingFileIds.has(fileId))
      return false

    this.loadingFileIds.add(fileId)
    return true
  }

  finishLoading(fileId: string): void {
    this.loadingFileIds.delete(fileId)
  }
}
