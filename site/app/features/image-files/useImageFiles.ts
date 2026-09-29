import type { Painter } from 'saier'
import type { Ref, ShallowRef } from 'vue'
import type { SitePlatformAdapter, SitePlatformFile } from '../../types/platform-adapter'
import type { ImageExportOptions } from './export'
import { ImageImportSizeError } from 'saier'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { exportDocumentImage, imageExportName } from './export'

export type ImageImportIntent = 'open' | 'place'
export interface PendingImageImport {
  file: SitePlatformFile
  documentId: string
  intent?: ImageImportIntent
  size?: { width: number, height: number }
}

interface ImageFilesOptions {
  painter: ShallowRef<Painter | undefined>
  canvas: Ref<HTMLCanvasElement | undefined>
  platform: SitePlatformAdapter
  activeDocumentId: () => string | undefined
  canImport: () => boolean
  canReceive: () => boolean
  onImported: () => void
  onError: (reason: 'importFailed' | 'unsupported' | 'exportFailed') => void
}

interface ImageFilesState {
  pending: ShallowRef<PendingImageImport | undefined>
  busy: ShallowRef<boolean>
  exportOpen: ShallowRef<boolean>
  exportName: ShallowRef<string>
  exportSize: ShallowRef<{ width: number, height: number }>
  pick: (intent: ImageImportIntent) => Promise<void>
  receive: (file: SitePlatformFile, intent?: ImageImportIntent) => void
  importPending: (intent: ImageImportIntent, resizeToFit?: boolean) => Promise<void>
  cancelImport: () => void
  openExport: () => void
  download: (settings: ImageExportOptions & { name: string }) => Promise<void>
}

const IMAGE_LIMITS = { maxDimension: 8192, maxPixels: 16_000_000 }

/** Coordinate file UI without giving asynchronous imports a moving document target. */
export function useImageFiles(options: ImageFilesOptions): ImageFilesState {
  const pending = shallowRef<PendingImageImport>()
  const busy = shallowRef(false)
  const exportOpen = shallowRef(false)
  const exportName = shallowRef('')
  const exportSize = shallowRef({ width: 0, height: 0 })
  let exportDocumentId: string | undefined
  let controller: AbortController | undefined
  let disposed = false

  function cancelImport(): void {
    controller?.abort()
    pending.value = undefined
  }

  function receive(file: SitePlatformFile, intent?: ImageImportIntent): void {
    const painter = options.painter.value
    if (!painter || busy.value || pending.value || !options.canImport())
      return
    if (!/^image\/(?:png|jpeg)$/i.test(file.type) && !(file.type === '' && /\.(?:png|jpe?g)$/i.test(file.name))) {
      options.onError('unsupported')
      return
    }
    pending.value = { file, documentId: painter.getActiveDocumentId(), intent }
    if (intent)
      void importPending(intent)
  }

  async function pick(intent: ImageImportIntent): Promise<void> {
    if (!options.canImport() || busy.value || pending.value)
      return
    const documentId = options.painter.value?.getActiveDocumentId()
    try {
      const file = await options.platform.openFile({ accept: 'image/png,image/jpeg,.png,.jpg,.jpeg' })
      if (file && !disposed && options.painter.value?.getActiveDocumentId() === documentId)
        receive(file, intent)
    }
    catch {
      options.onError('importFailed')
    }
  }

  async function importPending(intent: ImageImportIntent, resizeToFit = false): Promise<void> {
    const request = pending.value
    const painter = options.painter.value
    if (!request || !painter || busy.value || !options.canImport())
      return
    if (painter.getActiveDocumentId() !== request.documentId) {
      cancelImport()
      return
    }
    busy.value = true
    const abortController = new AbortController()
    controller = abortController
    let url: string | undefined
    try {
      const data = await request.file.arrayBuffer()
      abortController.signal.throwIfAborted()
      if (disposed || !options.canImport() || painter.getActiveDocumentId() !== request.documentId)
        return
      url = URL.createObjectURL(new Blob([data], { type: request.file.type }))
      const decodeOptions = { limits: IMAGE_LIMITS, resizeToFit, signal: abortController.signal }
      if (intent === 'open')
        await painter.openImage(url, { ...decodeOptions, name: request.file.name })
      else
        await painter.loadImage(url, { ...decodeOptions, label: request.file.name })
      pending.value = undefined
      options.onImported()
    }
    catch (error) {
      if (error instanceof ImageImportSizeError) {
        pending.value = { ...request, intent, size: { width: error.width, height: error.height } }
      }
      else if (!abortController.signal.aborted) {
        pending.value = undefined
        options.onError('importFailed')
      }
    }
    finally {
      if (url)
        URL.revokeObjectURL(url)
      busy.value = false
      controller = undefined
    }
  }

  function openExport(): void {
    const painter = options.painter.value
    if (!painter || busy.value || pending.value || !options.canReceive())
      return
    const document = painter.getDocuments().find(item => item.active)!
    exportDocumentId = document.id
    exportName.value = document.name
    exportSize.value = { width: document.width, height: document.height }
    exportOpen.value = true
  }

  async function download(settings: ImageExportOptions & { name: string }): Promise<void> {
    const painter = options.painter.value
    if (!painter || busy.value || painter.getActiveDocumentId() !== exportDocumentId)
      return
    busy.value = true
    try {
      const blob = await exportDocumentImage(painter, settings)
      if (disposed)
        return
      await options.platform.saveBlob(blob, { suggestedName: imageExportName(settings.name, settings.format) })
      exportOpen.value = false
    }
    catch {
      options.onError('exportFailed')
    }
    finally {
      busy.value = false
    }
  }

  function isTextTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'))
  }

  function onPaste(event: ClipboardEvent): void {
    if (!options.canReceive() || isTextTarget(event.target) || busy.value || pending.value)
      return
    const file = Array.from(event.clipboardData?.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    if (file) {
      event.preventDefault()
      receive(file)
    }
  }

  function onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files'))
      event.preventDefault()
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault()
    if (!options.canReceive())
      return
    const file = event.dataTransfer?.files[0]
    if (file)
      receive(file)
  }

  watch(options.canvas, (canvas, _, onCleanup) => {
    if (!canvas)
      return
    canvas.addEventListener('dragover', onDragOver)
    canvas.addEventListener('drop', onDrop)
    window.addEventListener('paste', onPaste)
    onCleanup(() => {
      canvas.removeEventListener('dragover', onDragOver)
      canvas.removeEventListener('drop', onDrop)
      window.removeEventListener('paste', onPaste)
    })
  }, { immediate: true })

  watch(options.activeDocumentId, (id) => {
    if (pending.value && pending.value.documentId !== id)
      cancelImport()
    if (exportOpen.value && exportDocumentId !== id)
      exportOpen.value = false
  }, { flush: 'sync' })

  watch(() => options.canImport(), (allowed) => {
    if (!allowed)
      cancelImport()
  })

  onBeforeUnmount(() => {
    disposed = true
    cancelImport()
  })

  return { pending, busy, exportOpen, exportName, exportSize, pick, receive, importPending, cancelImport, openExport, download }
}
