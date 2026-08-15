import { contextBridge, ipcRenderer } from 'electron'
import type { CatalogLoad, CatalogState } from '../main/catalog'
import {
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
  type CommandName,
  type CommandParams,
  type CommandResult,
  type EventBatch,
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
    save: (state: CatalogState): Promise<void> => ipcRenderer.invoke('catalog:save', state),
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
