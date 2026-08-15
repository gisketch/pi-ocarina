import { contextBridge, ipcRenderer } from 'electron'
import type { CatalogLoad, CatalogState } from '../main/catalog'

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
} as const

export type PiOcarinaBridge = typeof api

contextBridge.exposeInMainWorld('piocarina', api)
