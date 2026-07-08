const { contextBridge, ipcRenderer } = require('electron')

function createPlatformFile(payload) {
  const data = payload.data
  return {
    name: payload.name,
    size: payload.size,
    type: payload.type,
    arrayBuffer: async () => data.slice(0),
    text: async () => new TextDecoder().decode(data),
  }
}

async function saveBlob(blob, options) {
  const data = await blob.arrayBuffer()
  await ipcRenderer.invoke('saier:platform:save-file', {
    data,
    suggestedName: options.suggestedName,
    type: blob.type,
  })
}

const platformAdapter = {
  kind: 'electron',
  capabilities: {
    beforeUnload: true,
    fileOpen: true,
    fileSave: true,
    nativeFileSystem: true,
    safeArea: false,
    share: false,
    statusBar: false,
  },
  lifecycle: {
    onBeforeUnload(handler) {
      const listener = event => handler(event)
      window.addEventListener('beforeunload', listener)
      return () => window.removeEventListener('beforeunload', listener)
    },
  },
  async openFile(options = {}) {
    const payload = await ipcRenderer.invoke('saier:platform:open-file', options)
    return payload ? createPlatformFile(payload) : undefined
  },
  saveBlob,
  async saveDataUrl(dataUrl, options) {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    await saveBlob(blob, options)
  },
  async saveText(text, options) {
    await saveBlob(new Blob([text], { type: options.type || 'text/plain' }), options)
  },
  async share() {
    return false
  },
}

contextBridge.exposeInMainWorld('__SAIER_PLATFORM_ADAPTER__', platformAdapter)
