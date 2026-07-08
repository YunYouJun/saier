const { Buffer } = require('node:buffer')
const fs = require('node:fs/promises')
const path = require('node:path')
const process = require('node:process')
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')

const RENDERER_URL = process.env.SAIER_ELECTRON_RENDERER_URL || 'http://localhost:8080/'

let mainWindow

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#202124',
    title: 'Saier',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  void mainWindow.loadURL(RENDERER_URL)
}

function registerPlatformIpc() {
  ipcMain.handle('saier:platform:open-file', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: fileFiltersFromAccept(options.accept),
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0])
      return undefined

    const filePath = result.filePaths[0]
    const data = await fs.readFile(filePath)
    return {
      data: bufferToArrayBuffer(data),
      name: path.basename(filePath),
      size: data.byteLength,
      type: mimeTypeFromFileName(filePath),
    }
  })

  ipcMain.handle('saier:platform:save-file', async (_event, payload = {}) => {
    const suggestedName = typeof payload.suggestedName === 'string' && payload.suggestedName
      ? payload.suggestedName
      : 'saier'
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName,
      filters: fileFiltersFromFileName(suggestedName),
    })
    if (result.canceled || !result.filePath)
      return false

    await fs.writeFile(result.filePath, Buffer.from(payload.data))
    return true
  })
}

function fileFiltersFromAccept(accept) {
  if (typeof accept !== 'string' || !accept.trim())
    return undefined

  const extensions = Array.from(new Set(
    accept
      .split(',')
      .map(item => item.trim())
      .filter(item => item.startsWith('.'))
      .map(item => item.slice(1).split('.').at(-1))
      .filter(Boolean),
  ))

  return extensions.length > 0
    ? [
        { name: 'Supported Files', extensions },
        { name: 'All Files', extensions: ['*'] },
      ]
    : undefined
}

function fileFiltersFromFileName(fileName) {
  const extension = path.extname(fileName).replace(/^\./, '')
  return extension
    ? [
        { name: `${extension.toUpperCase()} Files`, extensions: [extension] },
        { name: 'All Files', extensions: ['*'] },
      ]
    : undefined
}

function mimeTypeFromFileName(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  switch (extension) {
    case '.json':
      return 'application/json'
    case '.myb':
      return 'text/plain'
    case '.png':
      return 'image/png'
    default:
      return ''
  }
}

function bufferToArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

registerPlatformIpc()

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
