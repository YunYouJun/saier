export type SitePlatformKind = 'capacitor' | 'electron' | 'web'

export interface SitePlatformCapabilities {
  beforeUnload: boolean
  fileOpen: boolean
  fileSave: boolean
  nativeFileSystem: boolean
  safeArea: boolean
  share: boolean
  statusBar: boolean
}

export interface SitePlatformFile {
  readonly name: string
  readonly size: number
  readonly type: string
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

export interface SitePlatformOpenFileOptions {
  accept?: string
}

export interface SitePlatformSaveOptions {
  suggestedName: string
}

export interface SitePlatformSharePayload {
  files?: File[]
  text?: string
  title?: string
  url?: string
}

export interface SitePlatformBeforeUnloadEvent {
  preventDefault: () => void
  returnValue: string
}

export type SitePlatformBeforeUnloadHandler = (event: SitePlatformBeforeUnloadEvent) => void

export interface SitePlatformLifecycleAdapter {
  onBeforeUnload: (handler: SitePlatformBeforeUnloadHandler) => () => void
}

export interface SitePlatformAdapter {
  capabilities: SitePlatformCapabilities
  kind: SitePlatformKind
  lifecycle: SitePlatformLifecycleAdapter
  openFile: (options?: SitePlatformOpenFileOptions) => Promise<SitePlatformFile | undefined>
  saveBlob: (blob: Blob, options: SitePlatformSaveOptions) => Promise<void>
  saveDataUrl: (dataUrl: string, options: SitePlatformSaveOptions) => Promise<void>
  saveText: (text: string, options: SitePlatformSaveOptions & { type?: string }) => Promise<void>
  share: (payload: SitePlatformSharePayload) => Promise<boolean>
}
