import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'

const dirname = fileURLToPath(new URL('.', import.meta.url))

// Chrome is drawn entirely by the renderer (the design owns its own titlebar and
// window buttons), so the window is frameless and the shell background matches
// the design's base surface to avoid a white flash before first paint.
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 560,
    show: false,
    frame: false,
    backgroundColor: '#0d0d10',
    webPreferences: {
      preload: join(dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) void win.loadURL(devServer)
  else void win.loadFile(join(dirname, '../renderer/index.html'))

  return win
}

function windowFromEvent(event: Electron.IpcMainEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function registerWindowControls(): void {
  ipcMain.on('window:minimize', (event) => windowFromEvent(event)?.minimize())
  ipcMain.on('window:toggle-maximize', (event) => {
    const win = windowFromEvent(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', (event) => windowFromEvent(event)?.close())
}

void app.whenReady().then(() => {
  registerWindowControls()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
