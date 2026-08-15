import type { BrowserWindow } from 'electron'

/** Drives the renderer's dev hook so a real run can prove the IPC path.
 *
 *  Temporary scaffolding for the milestone: run `PIOCARINA_SEAM_DEMO=1 pnpm dev`
 *  and the round trip is printed to stdout. Deleted once threads render the
 *  stream on their own. */
export async function runSeamDemo(win: BrowserWindow): Promise<void> {
  try {
    const result = await win.webContents.executeJavaScript('window.__piocarinaSeamDemo?.()')
    console.log('[seam-demo]', JSON.stringify(result))
  } catch (error) {
    console.error('[seam-demo] failed:', error)
  }
}
