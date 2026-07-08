import type {
  SitePlatformAdapter,
  SitePlatformBeforeUnloadHandler,
  SitePlatformCapabilities,
  SitePlatformOpenFileOptions,
  SitePlatformSaveOptions,
  SitePlatformSharePayload,
} from '~/types/platform-adapter'
import { isCapacitorNativeRuntime } from '~/utils/capacitorRuntime'

declare global {
  interface Window {
    __SAIER_PLATFORM_ADAPTER__?: SitePlatformAdapter
  }
}

let cachedCapacitorAdapter: SitePlatformAdapter | undefined
let cachedWebAdapter: SitePlatformAdapter | undefined
let capacitorChromeConfigured = false

export function useSitePlatformAdapter(): SitePlatformAdapter {
  if (import.meta.client && window.__SAIER_PLATFORM_ADAPTER__)
    return window.__SAIER_PLATFORM_ADAPTER__

  if (isCapacitorNativeRuntime()) {
    cachedCapacitorAdapter ??= createCapacitorPlatformAdapter()
    return cachedCapacitorAdapter
  }

  cachedWebAdapter ??= createWebPlatformAdapter()
  return cachedWebAdapter
}

const WEB_PLATFORM_CAPABILITIES: SitePlatformCapabilities = {
  beforeUnload: true,
  fileOpen: true,
  fileSave: true,
  nativeFileSystem: false,
  safeArea: false,
  share: import.meta.client && typeof navigator.share === 'function',
  statusBar: false,
}

function createWebPlatformAdapter(): SitePlatformAdapter {
  return {
    kind: 'web',
    capabilities: WEB_PLATFORM_CAPABILITIES,
    lifecycle: {
      onBeforeUnload(handler: SitePlatformBeforeUnloadHandler): () => void {
        return addWindowBeforeUnloadListener(handler)
      },
    },
    openFile: openFileWithInput,
    async saveBlob(blob: Blob, options: SitePlatformSaveOptions): Promise<void> {
      if (!import.meta.client)
        return

      await saveBlobWithDownload(blob, options)
    },
    async saveDataUrl(dataUrl: string, options: SitePlatformSaveOptions): Promise<void> {
      if (!import.meta.client)
        return

      triggerDownload(dataUrl, options.suggestedName)
    },
    async saveText(text: string, options: SitePlatformSaveOptions & { type?: string }): Promise<void> {
      await saveBlobWithDownload(new Blob([text], { type: options.type ?? 'text/plain' }), options)
    },
    share: shareWithNavigator,
  }
}

function createCapacitorPlatformAdapter(): SitePlatformAdapter {
  configureCapacitorChrome()

  return {
    kind: 'capacitor',
    capabilities: {
      beforeUnload: true,
      fileOpen: true,
      fileSave: true,
      nativeFileSystem: true,
      safeArea: true,
      share: true,
      statusBar: true,
    },
    lifecycle: {
      onBeforeUnload(handler: SitePlatformBeforeUnloadHandler): () => void {
        return addWindowBeforeUnloadListener(handler)
      },
    },
    openFile: openFileWithInput,
    async saveBlob(blob: Blob, options: SitePlatformSaveOptions): Promise<void> {
      await writeCapacitorBlob(blob, options, 'Documents')
    },
    async saveDataUrl(dataUrl: string, options: SitePlatformSaveOptions): Promise<void> {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await writeCapacitorBlob(blob, options, 'Documents')
    },
    async saveText(text: string, options: SitePlatformSaveOptions & { type?: string }): Promise<void> {
      await writeCapacitorBlob(new Blob([text], { type: options.type ?? 'text/plain' }), options, 'Documents')
    },
    share: shareWithCapacitor,
  }
}

function addWindowBeforeUnloadListener(handler: SitePlatformBeforeUnloadHandler): () => void {
  if (!import.meta.client)
    return () => {}

  const listener = (event: BeforeUnloadEvent) => handler(event)
  window.addEventListener('beforeunload', listener)
  return () => window.removeEventListener('beforeunload', listener)
}

function openFileWithInput(options: SitePlatformOpenFileOptions = {}): Promise<File | undefined> {
  if (!import.meta.client)
    return Promise.resolve(undefined)

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = options.accept ?? ''
    input.addEventListener('change', () => resolve(input.files?.[0]), { once: true })
    input.addEventListener('cancel', () => resolve(undefined), { once: true })
    input.click()
  })
}

async function saveBlobWithDownload(blob: Blob, options: SitePlatformSaveOptions): Promise<void> {
  const href = URL.createObjectURL(blob)
  try {
    triggerDownload(href, options.suggestedName)
  }
  finally {
    window.setTimeout(() => URL.revokeObjectURL(href), 0)
  }
}

async function shareWithNavigator(payload: SitePlatformSharePayload): Promise<boolean> {
  if (!import.meta.client || typeof navigator.share !== 'function')
    return false

  const shareData: ShareData = {
    ...(payload.files ? { files: payload.files } : {}),
    ...(payload.text ? { text: payload.text } : {}),
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.url ? { url: payload.url } : {}),
  }

  if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData))
    return false

  try {
    await navigator.share(shareData)
    return true
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return false
    throw error
  }
}

function configureCapacitorChrome(): void {
  if (!import.meta.client || capacitorChromeConfigured)
    return

  capacitorChromeConfigured = true

  void import('@capacitor/status-bar')
    .then(async ({ StatusBar, Style }) => {
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setStyle({ style: Style.Dark })
      await StatusBar.setBackgroundColor({ color: '#0f1012' })
    })
    .catch((error) => {
      console.warn('Failed to configure Capacitor status bar.', error)
    })
}

async function writeCapacitorBlob(
  blob: Blob,
  options: SitePlatformSaveOptions,
  directoryName: 'Cache' | 'Documents',
): Promise<string | undefined> {
  const [{ Directory, Filesystem }, data] = await Promise.all([
    import('@capacitor/filesystem'),
    blobToBase64(blob),
  ])
  const directory = directoryName === 'Cache' ? Directory.Cache : Directory.Documents
  const result = await Filesystem.writeFile({
    data,
    directory,
    path: capacitorFilePath(options.suggestedName),
    recursive: true,
  })

  return result.uri
}

async function shareWithCapacitor(payload: SitePlatformSharePayload): Promise<boolean> {
  const { Share } = await import('@capacitor/share')
  const firstFile = payload.files?.[0]
  const cachedFileUrl = firstFile
    ? await writeCapacitorBlob(firstFile, { suggestedName: firstFile.name }, 'Cache')
    : undefined

  await Share.share({
    ...(payload.text ? { text: payload.text } : {}),
    title: payload.title ?? firstFile?.name,
    url: payload.url ?? cachedFileUrl,
  })

  return true
}

function capacitorFilePath(suggestedName: string): string {
  return `saier/${suggestedName.replaceAll(/[\\/]/g, '-')}`
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read blob.')), { once: true })
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }, { once: true })
    reader.readAsDataURL(blob)
  })
}

function triggerDownload(href: string, suggestedName: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = suggestedName
  link.rel = 'noopener'
  link.click()
}
