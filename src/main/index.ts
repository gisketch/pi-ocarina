import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { CatalogPosition } from './catalog'
import { CatalogStore } from './catalog-store'
import { holdWindowOpen, registerLifecycle } from './lifecycle'
import { PiDriver } from './session/pi-driver'
import { registerSession } from './session'

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

/** The only way a folder path enters the app: a person picking one. */
function registerDialogs(): void {
  ipcMain.handle('dialog:pick-directory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Pin a workspace',
      properties: ['openDirectory', 'createDirectory'],
    }

    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}

function registerCatalog(catalog: CatalogStore): void {
  ipcMain.handle('catalog:load', async () => {
    const { state, warning } = await catalog.load()
    if (warning) console.warn(`[catalog] ${warning} — starting from defaults`)
    return { state, warning }
  })

  // The renderer sends its position only. Workspaces belong to main, so a layout
  // save can never erase a pin.
  ipcMain.handle('catalog:save', (_event, position: CatalogPosition) => {
    catalog.setPosition(position.workspaceIndex, position.focus)
  })
}

void app.whenReady().then(() => {
  const catalog = new CatalogStore(catalogFile())

  registerWindowControls()
  registerDialogs()
  registerCatalog(catalog)

  const driver = registerSession(catalog)
  const lifecycle = registerLifecycle({
    runningThreads: () => (driver instanceof PiDriver ? driver.runningThreads() : []),
    abortAll: () => (driver instanceof PiDriver ? driver.abortAll() : Promise.resolve()),
  })

  app.on('will-quit', () => {
    void driver.dispose()
    void catalog.flush()
  })

  const win = createWindow()
  holdWindowOpen(win, lifecycle.isQuitting)

  // Reopening from the dock shows the window that was hidden, rather than
  // building a second one on top of the running sessions.
  app.on('activate', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) existing.show()
    else holdWindowOpen(createWindow(), lifecycle.isQuitting)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
