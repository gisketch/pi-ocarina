import { bridge } from '../bridge'

/** The renderer's half of the workspace shells.
 *
 *  Deliberately not part of the session client: a shell is not a session, and
 *  its bytes travel on their own channel so a build printing thousands of
 *  lines cannot delay a running thread's tokens. Every method degrades to a
 *  no-op without a bridge, so the browser harness renders the column without a
 *  pty behind it. */
class Terminals {
  create(workspaceId: string): Promise<void> {
    return bridge?.terminal.create(workspaceId).then(() => undefined) ?? Promise.resolve()
  }

  kill(workspaceId: string): void {
    void bridge?.terminal.kill(workspaceId)
  }

  write(workspaceId: string, data: string): void {
    bridge?.terminal.write(workspaceId, data)
  }

  resize(workspaceId: string, cols: number, rows: number): void {
    bridge?.terminal.resize(workspaceId, cols, rows)
  }

  /** Whether the shell is running something. Unknown counts as not running:
   *  a question we cannot answer must not become a confirm dialog. */
  busy(workspaceId: string): Promise<boolean> {
    return bridge?.terminal.busy(workspaceId).then(({ busy }) => busy).catch(() => false)
      ?? Promise.resolve(false)
  }

  onData(workspaceId: string, listener: (data: string) => void): () => void {
    return bridge?.terminal.onData(workspaceId, listener) ?? (() => {})
  }
}

export const terminals = new Terminals()
