import type { PiOcarinaBridge } from '../../../preload/index'

declare global {
  interface Window {
    piocarina?: PiOcarinaBridge
  }
}

/** Null in the browser harness; components must degrade, never throw. */
export const bridge: PiOcarinaBridge | null =
  typeof window !== 'undefined' && window.piocarina ? window.piocarina : null

export const isDesktop = bridge !== null

export const windowControls = {
  minimize: () => bridge?.window.minimize(),
  toggleMaximize: () => bridge?.window.toggleMaximize(),
  close: () => bridge?.window.close(),
}
