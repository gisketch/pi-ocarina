import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CatalogLoad, CatalogPosition } from '../main/catalog'
import type { ConfigLoad } from '../shared/config-file'
import {
  GIT_STATUS_CHANNEL,
  SESSION_COMMAND_CHANNEL,
  SESSION_EVENTS_CHANNEL,
  ptyChannel,
  type CommandName,
  type CommandParams,
  type CommandResult,
  type EventBatch,
  type GitCommitDraft,
  type GitCommitResult,
  type GitStatusMessage,
  type PullRequestResult,
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
  /** The reader's own configuration file. Read only — the app never writes it,
   *  so there is no `save` here and there is not meant to be one. */
  config: {
    load: (): Promise<ConfigLoad & { path: string }> => ipcRenderer.invoke('config:load'),
  },
  files: {
    /** The real path of a dropped file. Electron 38 removed `File.path`, and
     *  this is the sanctioned replacement. The renderer never reads the file —
     *  it hands the path to main, which does. */
    pathFor: (file: File): string => webUtils.getPathForFile(file),
    /** Opens a file the app itself staged — a pasted screenshot, a dropped
     *  image — in whatever the operating system uses for it. The renderer never
     *  reads it; main does, and only for a path the app wrote or the reader
     *  chose. */
    open: (path: string): Promise<void> => ipcRenderer.invoke('files:open', path),
    /** An image as a data URI, or null when it is not one, is too large, or is
     *  gone. The renderer still opens nothing: it asks for a picture and main
     *  decides whether there is one to give. Needed because the app's CSP
     *  forbids `file://` in an `<img>`, deliberately. */
    image: (path: string): Promise<string | null> => ipcRenderer.invoke('files:image', path),
  },
  dialog: {
    /** Native folder picker; null when the user cancels. The renderer never
     *  sees a filesystem API, only the path a person deliberately chose. */
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-directory'),
  },
  /** Quitting with work in flight. Main asks; the app's own confirm modal
   *  answers, so the question looks like every other destructive one. */
  lifecycle: {
    onConfirmQuit: (listener: (running: number) => void): (() => void) => {
      const handler = (_event: unknown, running: number): void => listener(running)
      ipcRenderer.on('lifecycle:confirm-quit', handler)
      return () => ipcRenderer.off('lifecycle:confirm-quit', handler)
    },
    answerQuit: (ok: boolean): void => ipcRenderer.send('lifecycle:quit-answer', ok),
    /** Main gave up waiting and is asking natively instead; take the question
     *  off screen rather than showing it twice. */
    onWithdrawQuit: (listener: () => void): (() => void) => {
      const handler = (): void => listener()
      ipcRenderer.on('lifecycle:withdraw-quit', handler)
      return () => ipcRenderer.off('lifecycle:withdraw-quit', handler)
    },
  },
  /** Repository state. `refresh` only asks; every answer, whether it was asked
   *  for or caused by a write under `.git`, arrives on `onStatus`. */
  git: {
    refresh: (workspaceId: string): void => ipcRenderer.send('git:refresh', workspaceId),
    statuses: (): Promise<GitStatusMessage[]> => ipcRenderer.invoke('git:statuses'),
    changes: (workspaceId: string, threadId?: string): Promise<GitCommitDraft> =>
      ipcRenderer.invoke('git:changes', workspaceId, threadId),
    commit: (
      workspaceId: string,
      options: { message: string; paths: string[]; push: boolean; threadId?: string },
    ): Promise<GitCommitResult> => ipcRenderer.invoke('git:commit', workspaceId, options),
    push: (workspaceId: string, threadId?: string): Promise<GitCommitResult> =>
      ipcRenderer.invoke('git:push', workspaceId, threadId),
    /** Pushes an isolated thread's branch and answers where its pull request
     *  would be opened. */
    pullRequest: (workspaceId: string, threadId: string): Promise<PullRequestResult> =>
      ipcRenderer.invoke('git:pullRequest', workspaceId, threadId),
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
