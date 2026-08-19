import { bridge } from '../bridge'

/** The renderer's half of the workspace shells.
 *
 *  Deliberately not part of the session client: a shell is not a session, and
 *  its bytes travel on their own channel so a build printing thousands of
 *  lines cannot delay a running thread's tokens. Every method degrades to a
 *  no-op without a bridge, so the browser harness renders the column without a
 *  pty behind it. */
class Terminals {
  create(terminalId: string, workspaceId: string): Promise<void> {
    return bridge?.terminal.create({ id: terminalId, workspaceId }).then(() => undefined)
      ?? Promise.resolve()
  }

  kill(terminalId: string): void {
    void bridge?.terminal.kill(terminalId)
  }

  write(terminalId: string, data: string): void {
    bridge?.terminal.write(terminalId, data)
  }

  resize(terminalId: string, cols: number, rows: number): void {
    bridge?.terminal.resize(terminalId, cols, rows)
  }

  /** Whether the shell is running something. Unknown counts as not running:
   *  a question we cannot answer must not become a confirm dialog. */
  busy(terminalId: string): Promise<boolean> {
    return bridge?.terminal.busy(terminalId).then(({ busy }) => busy).catch(() => false)
      ?? Promise.resolve(false)
  }

  onData(terminalId: string, listener: (data: string) => void): () => void {
    return bridge?.terminal.onData(terminalId, listener) ?? (() => {})
  }
}

export const terminals = new Terminals()
