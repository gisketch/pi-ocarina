# Exec Plan: Core Usability (G)

Spec: [2026-08-16-core-usability.md](../../specs/2026-08-16-core-usability.md).

Status legend: `todo` · `in-progress` · `done`.

These tickets are written low-level on purpose: each step names the file, the
symbol, and the exact change. Verify a named line still says what the ticket
claims before editing it — the ticket was written against the tree at
`399fd5e`.

## G1 — Welcome screen, demo behind the harness — `todo`

Delivered behavior: Electron with nothing pinned shows a welcome screen; the
demo catalog renders only in the browser harness.

Steps:

1. `src/renderer/src/lib/state/catalog.svelte.ts`:
   - Extend `CatalogSource` with `'empty'`.
   - Change the initializers: `workspaces` starts as `[]` and `source` as
     `'empty'` when `bridge` is present; keep `WORKSPACES` / `'mock'` when
     `bridge` is null (browser harness). Import `bridge` (already imported).
   - In `load()`, when `pinned.length === 0`: keep `source` as is (`'empty'`
     in Electron, `'mock'` in the harness) and return — today's early return
     already does this once the initializers change.
2. `src/renderer/src/App.svelte`:
   - Line 29: guard the seeding — `if (!bridge) seedMockThreads()`.
   - In the `.main` div, render `<Welcome />` instead of `<Strip />` +
     `<Composer />` when `catalog.source === 'empty'`. Keep `Rail`,
     `Titlebar`, `Statusbar` mounted; they must tolerate an empty catalog
     (step 4).
3. New `src/renderer/src/components/Welcome.svelte`:
   - Centered card: the wordmark (reuse the Titlebar markup style, not the
     component), one line of text ("pin a folder to start"), one action row
     showing the `⏎` key hint, and `catalog.error` underneath when set.
   - `⏎` handling stays in the keyboard layer (step 5); the component also
     offers a click on the action row calling `catalog.pin()`.
4. Empty-catalog guards — `app.workspace` is `this.workspaces[0]` on an empty
   array today, which is `undefined`:
   - `src/renderer/src/lib/state/app.svelte.ts`: make `workspace` return a
     frozen placeholder (`{ id: '', name: '', note: '', hue: 0, branch: '',
     git: '', snippet: '', threads: [] }`) when `workspaces.length === 0`;
     make `thread` return a frozen `{ id: '', title: '', status: 'idle',
     meta: '', fresh: true }` when the workspace has no threads; make
     `threadLabel` return `'–'` when there are no threads.
   - Check `Titlebar.svelte`, `Statusbar.svelte`, `Rail.svelte` render sanely
     against the placeholders (blank segments, no crash).
5. `src/renderer/src/lib/keyboard.ts`: in `reduceNormal`, when
   `ctx.workspaceCount === 0` (add the field to `KeyContext` if absent —
   check first), `Enter` emits a new action `{ type: 'pinWorkspace' }`.
   `src/renderer/src/lib/state/shell.svelte.ts`: handle `pinWorkspace` by
   calling `void catalog.pin()`.
6. After `catalog.pin()` succeeds, `load()` flips `source` to `'live'` and the
   strip replaces the welcome screen — no extra wiring needed; verify with a
   state test.

Acceptance: harness (pnpm dev in browser) still shows the demo; Electron with
an empty catalog store shows the welcome screen; `⏎` opens the picker; after
pinning, the strip appears with one fresh column.

Validation: state tests for source branching and the `pinWorkspace` key
action; existing catalog tests updated for the `'empty'` initializer;
`pnpm check`; manual Electron pass.

Blocked by: —

## G2 — Leader `n` creates a real thread; no disk round-trip — `todo`

Delivered behavior: leader `n` makes a focused, composer-ready column; a
send-created thread never loses its column; empty threads do not survive
restart.

Steps:

1. `src/renderer/src/lib/state/catalog.svelte.ts`, `newThread()`:
   - Delete the `await this.load()` (line 70). After `createThread` returns,
     insert locally: build `{ id: threadId, title: 'new thread', status:
     'idle', meta: '' }` and replace the workspace's threads array —
     `workspaces` is `$state.raw`, so rebuild the array:
     `this.workspaces = this.workspaces.map(w => w.id === workspaceId ? { ...w,
     threads: [...w.threads.filter(t => !t.fresh), fresh-less new entry] } :
     w)`. A fresh placeholder is replaced by the real thread, not kept beside
     it.
   - Still `threads.follow(threadId)` before returning.
2. `src/renderer/src/lib/state/shell.svelte.ts`, effect `case 'newThread'`
   (line 99): replace the no-op with:
   - `catalog.source !== 'live'` → `void catalog.pin()` and return.
   - Otherwise `void catalog.newThread(app.workspace.id).then(id => …)`; on a
     non-null id, find its index in `app.workspace.threads`, call
     `app.focusThread(index)`, set `app.mode = 'INSERT'`, and run the
     `focusComposer` effect (`queueMicrotask(() => this.targets.composer?.
     focus())` — same body as `case 'focusComposer'`; extract a private
     method rather than duplicating).
3. `src/renderer/src/App.svelte`, `runCommand` `case 'new-thread'` (line 128):
   route through the same shell effect so palette and leader share one path;
   delete the `goWorkspace(app.workspaces.length - 1)` demo fallback.
4. Empty-thread pruning — first **verify when pi writes the session file**:
   create a session in a live test and `stat` `session.sessionFile` before
   any prompt.
   - If the file does not exist until the first message: nothing to build;
     record the fact in this ticket's handover note.
   - If it exists eagerly: in `src/main/session/workspaces.ts` (or
     `queries.ts`, wherever `listThreads` reads entries), skip sessions whose
     file contains no user message. Cheapest check that is still honest:
     stream-read the file and look for the session manager's user-message
     entry marker; confirm the marker against a real file first, do not guess
     the JSON shape.
5. Titlebar dots → thread dots. `src/renderer/src/components/Titlebar.svelte`:
   - Line 8: `dotCount = app.workspace.threads.length` (drop the `+ 1`).
   - Line 38: `class:active={i === app.threadIndex}`.
   - Update the comment: the dots mirror the thread strip (spec decision,
     supersedes the workspace reading).

Acceptance: leader `n` → new focused column, composer focused, typing streams
into that column; send in a fresh column keeps its column; dots track
`h`/`l`; restart drops never-used threads.

Validation: state tests for local insert (no `load()` call — assert via a
session stub), focus handoff, and dot derivation; live test for the
session-file timing fact; `pnpm check`.

Blocked by: G1 (shares the `pinWorkspace` action and empty-state guards)

## G3 — Leader `x` closes the focused thread — `todo`

Delivered behavior: leader `x` hides the focused thread's column, with one
confirm when it is running; hidden threads stay hidden across restarts;
history search restores them.

Steps:

1. Catalog store v4. `src/main/catalog.ts`:
   - Add `archived: string[]` per workspace (thread ids). Bump the version to
     4; the v3 → v4 upgrade adds `archived: []` and keeps pins and approvals
     — follow the existing v2 → v3 upgrade shape.
2. Protocol. `src/shared/protocol.ts`: `archiveThread` already exists. Add
   `unarchiveThread { threadId }` → `{ ok: true }`.
3. Main. `src/main/session/queries.ts` (or wherever `listThreads` answers):
   filter out ids in the workspace's `archived` list. `archiveThread` in
   `src/main/session/pi-driver.ts` (line 154): besides `this.#threads.close`,
   record the id in the catalog store's `archived`. `unarchiveThread` removes
   it. Keep `WorkspaceService.remember` mappings so `locate` still resolves
   archived threads for search and reopen.
4. Search must still see archived threads: check `searchThreads`
   (`src/main/session/search.ts`) reaches threads via `listThreads` — if so,
   give it an unfiltered listing (`listThreads(id, { archived: true })` or a
   second query method), because the spec says search finds closed threads.
5. Keyboard. `src/renderer/src/lib/keyboard.ts`: add `case 'x'` in
   `reduceLeader` → new action `{ type: 'closeThread' }`. Add the action to
   the `KeyAction` union (line 16 area). Add the row to the keymap overlay's
   data (find the leader list the `?` overlay renders).
6. Shell effect. `src/renderer/src/lib/state/shell.svelte.ts`:
   - `closeThread` on a fresh/placeholder thread → no-op.
   - If `threads.get(app.thread.id).runState === 'running'` → open a confirm
     (reuse the existing confirm pattern from checkpoint restore — find it in
     the overlay components; do not invent a second dialog primitive).
     Confirming runs the close; declining does nothing.
   - Close = `session.invoke('cancelTurn')` when running, then
     `session.invoke('archiveThread')`, then remove the thread from
     `catalog.workspaces` locally (same rebuild pattern as G2 step 1) and
     `app.reconcile()`. A workspace whose last thread closed gets its fresh
     placeholder back (reuse `freshThread`, exported or moved as needed).
7. Reopen from search. `src/renderer/src/App.svelte`, the search jump handler
   (`goThread`, line ~100): when the thread is not in the strip
   (`column === -1`), invoke `unarchiveThread`, insert the thread into
   `catalog.workspaces` locally (title from the search hit), `follow` it,
   then focus it.

Acceptance: leader `x` on an idle thread removes the column; on a running
thread, confirm first; restart keeps it hidden; `/` finds it; `⏎` restores
the column with history replayed.

Validation: catalog v3 → v4 upgrade test; state tests for close, confirm
branch, last-thread placeholder, and search-restore; live test: archive then
unarchive round-trip; `pnpm check`.

Blocked by: G2 (local insert/remove pattern, shared effect helpers)

## G4 — Live status bar & the model-chip race — `todo`

Delivered behavior: every chrome segment reads the focused thread's real
data; the model chip never sticks on "pi default" for a real thread.

Steps:

1. The race fix, main side. `src/main/session/pi-driver.ts`, `#openThread`
   (line 201): the early return `if (this.#threads.has(threadId)) return`
   swallows the announce for a thread adopted during `createThread` (the
   renderer follows only after `createThread` resolves, so the adopt-time
   announce is emitted before anyone subscribes). Change the early return to
   re-announce before returning:
   `this.#models.announce(threadId, this.#threads.find(threadId)?.session,
   this.#emit)`.
2. Usage on open. Same file: `#emitUsage` runs only on `turn_end`, so a
   reopened thread shows zeros until its next turn. Call
   `this.#emitUsage(threadId, session)` at the end of `#adopt` and in the
   `#openThread` early-return branch, so the meter reflects the session's
   accounting immediately.
3. Statusbar wiring. `src/renderer/src/components/Statusbar.svelte`:
   - Delete the hardcoded `ctxPercent` / `usage` consts (lines 4–6).
   - `import { threads } from '$lib/state/threads.svelte'`; derive
     `const vm = $derived(threads.get(app.thread.id))`;
     `ctxPercent = vm.usage?.contextPercent ?? 0` (check the actual
     `ThreadViewModel.usage` field names in `src/renderer/src/lib/thread.ts`
     first).
   - New `src/renderer/src/lib/usage-format.ts`: `formatTokens(n)` →
     `"12.4k tok"` (`k` at ≥1000, one decimal; plain integer below), and
     `formatCost(usd)` → `"$0.31"` (two decimals; `"$0.00"` when zero). The
     segment shows `formatTokens · formatCost`, or an empty string when the
     thread has no usage yet.
4. Fresh/empty threads: `threads.get('')` and `threads.get('fresh:…')` return
   `EMPTY_THREAD`, so the derivations above already degrade to 0% / blank —
   assert this in a test rather than assuming.
5. The model chip itself (`Titlebar.svelte` line 13) is already derived from
   the thread model; after step 1 it updates on create, reopen, and switch.
   Keep "pi default" as the fallback text for fresh columns only.

Acceptance: create a thread → chip shows the real model without a turn;
relaunch and focus an old thread → chip and ctx meter show that session's
model and usage; run a turn → meter and token/cost update at turn end;
switch threads → all three segments switch.

Validation: unit tests for `usage-format`; a translator/driver test asserting
`#openThread` on an already-open thread re-emits model + usage; live pi test:
create → follow → model event observed; `pnpm check`.

Blocked by: G2 (create path exercised by the acceptance run)

## Order

G1 → G2 → {G3, G4}
