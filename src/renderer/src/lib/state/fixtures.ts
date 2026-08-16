/** The one description of the world these state tests run in.
 *
 *  Kept in one file because it was two: when the bridge grows a method, a
 *  second copy of this mock silently keeps the old shape and the tests that
 *  use it start describing an app that no longer exists. */

export const BRIDGE_MOCK = {
  bridge: {
    dialog: { pickDirectory: () => Promise.resolve(null) },
    session: { invoke: () => Promise.resolve({ ok: true }), onEvents: () => () => {} },
    git: {
      refresh: () => {},
      statuses: () => Promise.resolve([]),
      onStatus: () => () => {},
      changes: () => Promise.resolve({ changes: [], message: '' }),
      commit: () => Promise.resolve({ ok: true, pushed: false }),
      push: () => Promise.resolve({ ok: true, pushed: true }),
    },
    terminal: {
      create: () => Promise.resolve({ ok: true }),
      kill: () => Promise.resolve({ ok: true }),
      write: () => {},
      resize: () => {},
      busy: () => Promise.resolve({ busy: false }),
      onData: () => () => {},
    },
  },
  isDesktop: true,
}

export const WORKSPACE = {
  id: 'w1',
  name: 'pi-core',
  note: 'D',
  hue: 152,
  git: null,
  snippet: '/code/pi-core',
  threads: [
    { id: 's1', title: 'first', status: 'idle' as const, meta: '' },
    { id: 's2', title: 'second', status: 'idle' as const, meta: '' },
  ],
}
