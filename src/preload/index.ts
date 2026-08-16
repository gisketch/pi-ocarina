import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CatalogLoad, CatalogPosition } from '../main/catalog'
import {
  GIT_STATUS_CHANNEL,
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
  ptyChannel,
  type CommandName,
  type CommandParams,
  type CommandResult,
  type EventBatch,
  type GitStatusMessage,
} from '../shared/protocol'

// The preload is a typed bridge only — no logic. The renderer must keep working
// when this bridge is absent (browser harness), so every consumer goes through
// src/renderer/src/lib/bridge.ts rather than touching window.piocarina directly.
const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  catalog: {
    load: (): Promise<CatalogLoad> => ipcRenderer.invoke('catalog:load'),
    save: (position: CatalogPosition): Promise<void> => ipcRenderer.invoke('catalog:save', position),
  },
  files: {
    /** The real path of a dropped file. Electron 38 removed `File.path`, and
     *  this is the sanctioned replacement. The renderer never reads the file —
     *  it hands the path to main, which does. */
    pathFor: (file: File): string => webUtils.getPathForFile(file),
  },
  dialog: {
    /** Native folder picker; null when the user cancels. The renderer never
     *  sees a filesystem API, only the path a person deliberately chose. */
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-directory'),
  },
  /** Repository state. `refresh` only asks; every answer, whether it was asked
   *  for or caused by a write under `.git`, arrives on `onStatus`. */
  git: {
    refresh: (workspaceId: string): void => ipcRenderer.send('git:refresh', workspaceId),
    statuses: (): Promise<GitStatusMessage[]> => ipcRenderer.invoke('git:statuses'),
    onStatus: (listener: (message: GitStatusMessage) => void): (() => void) => {
      const handler = (_event: unknown, message: GitStatusMessage): void => listener(message)
      ipcRenderer.on(GIT_STATUS_CHANNEL, handler)
      return () => ipcRenderer.off(GIT_STATUS_CHANNEL, handler)
    },
  },
  /** The workspace's shell. Output has its own channel per workspace so a
   *  noisy build cannot delay a thread's tokens. */
  terminal: {
    create: (workspaceId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('terminal:create', workspaceId),
    kill: (workspaceId: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke('terminal:kill', workspaceId),
    write: (workspaceId: string, data: string): void =>
      ipcRenderer.send('terminal:write', workspaceId, data),
    resize: (workspaceId: string, cols: number, rows: number): void =>
      ipcRenderer.send('terminal:resize', workspaceId, cols, rows),
    busy: (workspaceId: string): Promise<{ busy: boolean }> =>
      ipcRenderer.invoke('terminal:busy', workspaceId),
    onData: (workspaceId: string, listener: (data: string) => void): (() => void) => {
      const channel = ptyChannel(workspaceId)
      const handler = (_event: unknown, data: string): void => listener(data)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.off(channel, handler)
    },
  },
  session: {
    invoke: <N extends CommandName>(
      name: N,
      params: CommandParams<N>,
    ): Promise<CommandResult<N>> => ipcRenderer.invoke(SESSION_COMMAND_CHANNEL, name, params),
    onEvents: (listener: (batches: EventBatch[]) => void): (() => void) => {
      const handler = (_event: unknown, batches: EventBatch[]): void => listener(batches)
      ipcRenderer.on(SESSION_EVENTS_CHANNEL, handler)
      return () => ipcRenderer.off(SESSION_EVENTS_CHANNEL, handler)
    },
  },
} as const

export type PiOcarinaBridge = typeof api

contextBridge.exposeInMainWorld('piocarina', api)
