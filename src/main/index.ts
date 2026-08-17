import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { CatalogPosition } from './catalog'
import { CatalogStore } from './catalog-store'
import { registerGit } from './git'
import { holdWindowOpen, registerLifecycle } from './lifecycle'
import { PiDriver } from './session/pi-driver'
import { registerSession } from './session'

const dirname = fileURLToPath(new URL('.', import.meta.url))

/** Whether a URL is the app itself rather than somewhere else.
 *
 *  Compared as a parsed origin and path, not as a string prefix. A prefix is
 *  the wrong primitive here twice over: `http://localhost:51730` starts with
 *  `http://localhost:5173`, and `…/index.html/../secret.html` starts with
 *  `…/index.html`. Neither is reachable today — nothing can produce a `file:`
 *  navigation — but a guard is only worth having if it holds when the thing in
 *  front of it stops holding. */
function isOwn(url: string, devServer: string | undefined): boolean {
  try {
    const target = new URL(url)
    if (devServer) return target.origin === new URL(devServer).origin

    const entry = new URL(`file://${join(dirname, '../renderer/index.html')}`)
    return target.protocol === 'file:' && target.pathname === entry.pathname
  } catch {
    return false
  }
}

/** Schemes the app will hand to the operating system.
 *
 *  An allow-list, not a deny-list. `openExternal` will launch whatever the OS
 *  associates with a scheme, so a link an agent wrote is only ever followed
 *  when it is one of the three a reader could have meant. */
function isExternal(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

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

  const devServer = process.env.ELECTRON_RENDERER_URL

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The window itself never goes anywhere. An agent can write a link into a
  // message, and without this a click on one replaces the whole app with a web
  // page — every column, every running turn, gone, with no way back.
  win.webContents.on('will-navigate', (event, url) => {
    if (isOwn(url, devServer)) return

    event.preventDefault()
    if (isExternal(url)) void shell.openExternal(url)
  })

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
  // The store is already loaded before any window exists, so this reports what
  // main holds rather than reading the file again. A second read here would
  // race the first: a folder pinned in between would be replaced by whatever
  // the file said before it was written.
  ipcMain.handle('catalog:load', () => ({ state: catalog.snapshot(), warning: catalog.warning }))

  // The renderer sends its position only. Workspaces belong to main, so a layout
  // save can never erase a pin.
  ipcMain.handle('catalog:save', (_event, position: CatalogPosition) => {
    catalog.setPosition(
      position.workspaceIndex,
      position.focus,
      position.preferences,
      position.order,
    )
  })
}

void app.whenReady().then(async () => {
  const catalog = new CatalogStore(catalogFile())
  // Before anything can be asked about it. The driver answers `listWorkspaces`
  // straight from this store, and the renderer asks the moment it starts, so a
  // store still holding its empty defaults would report that nothing is pinned
  // — and the app would greet a returning user with the welcome screen.
  const { warning } = await catalog.load()
  if (warning) console.warn(`[catalog] ${warning} — starting from defaults`)

  registerWindowControls()
  registerDialogs()
  registerCatalog(catalog)

  // The driver is built after git, and git needs to ask it where a thread
  // runs. The question is only ever asked from an IPC handler, long after both
  // exist, so it is wired through a reference rather than by reordering.
  let piDriver: PiDriver | null = null
  const git = registerGit(catalog, {
    cwdOfThread: (threadId) => piDriver?.threadCwd(threadId) ?? null,
    branchOfThread: (threadId) => piDriver?.threadBranch(threadId) ?? null,
  })
  const { driver, terminals } = registerSession(catalog, {
    // Unpinning a folder ends everything the app was holding for it.
    onUnpin: (workspaceId) => git.forget(workspaceId),
  })
  piDriver = driver instanceof PiDriver ? driver : null
  const lifecycle = registerLifecycle({
    runningThreads: () => (driver instanceof PiDriver ? driver.runningThreads() : []),
    abortAll: () => (driver instanceof PiDriver ? driver.abortAll() : Promise.resolve()),
  })

  app.on('will-quit', () => {
    void driver.dispose()
    // The shells are not daemons: they exist for as long as the window does.
    terminals.disposeAll()
    git.disposeAll()
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
