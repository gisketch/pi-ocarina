import { contextBridge, ipcRenderer } from 'electron'

// The preload is a typed bridge only — no logic. The renderer must keep working
// when this bridge is absent (browser harness), so every consumer goes through
// src/renderer/src/lib/bridge.ts rather than touching window.piocarina directly.
const api = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
} as const

export type PiOcarinaBridge = typeof api

contextBridge.exposeInMainWorld('piocarina', api)
