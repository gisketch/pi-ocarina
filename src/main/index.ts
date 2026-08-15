import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { type CatalogState, readCatalog, writeCatalog } from './catalog'

const dirname = fileURLToPath(new URL('.', import.meta.url))

// Set before anything reads a path: userData derives from the app name, and an
// unnamed dev run would scatter state across an "Electron" directory instead.
app.setName('PiOcarina')

const catalogFile = (): string => join(app.getPath('userData'), 'catalog.json')

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

function registerCatalog(): void {
  ipcMain.handle('catalog:load', async () => {
    const { state, warning } = await readCatalog(catalogFile())
    if (warning) console.warn(`[catalog] ${warning} — starting from defaults`)
    return { state, warning }
  })

  ipcMain.handle('catalog:save', async (_event, state: CatalogState) => {
    try {
      await writeCatalog(catalogFile(), state)
    } catch (error) {
      // Losing layout is not worth surfacing to the user mid-session.
      console.warn('[catalog] save failed:', error)
    }
  })
}

void app.whenReady().then(() => {
  registerWindowControls()
  registerCatalog()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
