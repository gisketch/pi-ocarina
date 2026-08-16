# Exec Plan: Chat Navigation (H)

Spec: none yet. This plan is written from a direct product instruction
(2026-08-16) and records the decisions it settled. Write
`docs/specs/2026-08-16-chat-navigation.md` from this plan if the behavior
outgrows it.

Status legend: `todo` · `in-progress` · `done`.

These tickets are written low-level on purpose: each step names the file, the
symbol, and the exact change. Verify a named symbol still says what the ticket
claims before editing it — the ticket was written against the tree at
`58a2c44`.

## The problem

`j` and `k` scroll the focused column by 100px. That is a pager, not
navigation. The reader cannot say "this block", so nothing can act on a block:
no copy, no restore, no jump. The checkpoint separator exists only because
restore had nowhere else to live, and it cuts the transcript in half every
time the user speaks.

## Decisions this plan settles

1. **A nav block is one addressable thing in the transcript.** One per user
   message, one per agent message, one per *top-level* tool row, one per card
   (ask, approve, compaction, steer, raw). A ledger is not one block: its rows
   are. Nested subagent rows are **not** separate nav blocks — they belong to
   their parent row, which keeps ledger nesting the single special case it is
   today.
2. **A checkpoint is not a block.** `replay.ts` and `pi-translate.ts` both emit
   a `checkpoint` block immediately before the `user` block from the same
   session entry (ids `entry.id` and `user:${entry.id}`). The checkpoint's id
   attaches to that user nav block as `checkpointId`, and the separator stops
   rendering. Restore moves into the block menu.
3. **Focus is unset until the reader asks for it.** No dimming, no highlight,
   until the first `j` / `k` / `s`. `esc` clears it; entering INSERT clears it.
   Arriving blocks never steal or clear it.
4. **Dim is 50% opacity on every block except the focused one**, applied only
   while focus is set. Opacity is the *whole* of it — an accent strip on the
   focused block was tried and removed. Two signals for one state is one too
   many, and the strip shifted the text it marked.
5. **The menu key is `a`, for "actions".** Home row, left index finger,
   directly beside `s` — the two block-level operations sit side by side. `a`
   is unbound today. Vim's `a` appends, but this app enters INSERT with `i`
   only, so there is no habit to fight. `Enter` was considered and rejected:
   it is far from the home row, and it already means "pin a folder" on the
   welcome screen.
6. **Terminal columns keep the old behavior.** `j` / `k` / `ctrl-u` / `ctrl-d`
   in a terminal column scroll the xterm viewport. A shell has no blocks.

## Amendments after the first review round (2026-08-16)

Fable reviewed H1–H4 and found two P1s; the user asked for four changes at the
same time. Both sets are folded into the tickets above, and the decisions they
changed are recorded here rather than left to the diff.

10. **READ is a mode.** Walking a transcript is not NORMAL. In READ, `h` and
    `l` belong to the block — expand and collapse a tool row — and cannot
    reach the strip, so holding a key one press too long can no longer slide
    the reader into the next thread. `esc` goes back to NORMAL, where `h` and
    `l` move between columns again. `j`, `k` and `s` enter READ from NORMAL; a
    terminal column has no blocks and stays in NORMAL.
11. **The first press starts where the reader is looking.** `j` with no ring
    takes the first block in view, `k` the last. Jumping to the absolute top of
    a thread somebody has scrolled a long way down is not navigation.
12. **A checkpoint attaches to whichever user message is adjacent to it.**
    Decision 2 was half right. Replay emits the checkpoint first; a live turn
    emits the message from the driver before pi is asked, and the checkpoint
    arrives afterwards. Attaching only backwards meant restore was missing for
    the entire session it was spoken in. Adjacency is what stops a checkpoint
    reaching past a message that produced no blocks and labelling the next one.
13. **Expansion state lives outside the ledger component.** Two things open a
    row now — a click and `l` — and one of them has no component to reach into.
14. **The menu escapes its block's paint containment, and flips up when there
    is no room below.** `content-visibility: auto` on every block brings paint
    containment, which clipped the menu to a one-line message's box: the
    restore row and the whole confirm panel were invisible while the state
    machine ran them.
15. **A menu or a set of hints is dropped when it loses what it points at.**
    Both are modal and both swallow keys, so either one left behind on a column
    the reader clicked away from would eat every keystroke from behind a
    surface no longer drawn.

## Amendments after the second review round (2026-08-16)

16. **Paint containment has to be lifted at every level, not one.** The first
    fix lifted it on the block wrapper and on the ledger row. The ledger's own
    box is also a direct child of the scroller, so it carried the same
    containment and clipped a menu hanging off its last row. A containment
    escape is only as good as its outermost ancestor.
17. **`esc` closes an overlay without also leaving the mode underneath it.**
    A reader who opens the keymap from READ is still in READ when it closes.
18. **The ring is released by `esc` whenever there is one**, not only from
    READ. A reader can leave READ through doors that never touch the
    transcript keys — a leader chord, a digit — and a ring only `esc`-from-READ
    could clear would strand a dimmed transcript with no way back.
19. **READ cannot outlive the focus it describes.** The mode is reconciled
    after every keystroke and after every click on a column: a mode chip that
    disagrees with what the keys do is worse than no chip.
20. **A menu is dropped when its block is not drawn**, not merely when it is
    absent from the model. A compaction folds blocks out of the rendered list
    while leaving them in place, which membership alone cannot see.
21. **Expansion is keyed by nav id.** A tool call id is unique within its call,
    not within the thread — which is why the nav id is built from both.

## H5 — leap searches text, not blocks — `done`

Spec: [2026-08-16-leap.md](../../specs/2026-08-16-leap.md), which supersedes
H3's block labelling and carries the settled decisions.

Delivered behavior: `s` dims the transcript; one character paints every
occurrence of it; a second narrows and labels them; the label focuses the block
holding that occurrence.

Validation: `leap.test.ts` for the pure search, labels and paging;
`state/leap.test.ts` for the three phases against a stubbed column; the key
path in `block-keys.test.ts`; and a browser pass on the real walk and paint.

Blocked by: H1

## Perf evidence for the slice (2026-08-16)

Measured on a seeded 5,000-block thread (108,000px of scrollback), sweeping the
column in 120 steps. Two methodologies, because they answer different questions
— see the note in [quality.md](../../quality.md).

Forced layout, the way C5 measured: **0ms median, 0/120 over budget** in all
three states (no ring, ring + dim, mid-leap). The slice costs no layout;
`content-visibility` still holds.

Frame interval, which includes paint — relative numbers only, since a sweep
moving ~900px per frame is harsher than any person:

| | median | worst |
|---|---|---|
| no ring (baseline) | 35.8ms | 54.6ms |
| ring + dim | 44.5ms | 61.7ms |
| mid-leap | 42.4ms | 49.5ms |

Two regressions were found and fixed by this measurement, neither visible to
the test suite:

1. The dim was `opacity` + `filter: grayscale(1)` on every block, costing about
   a third more paint per frame. It re-points colour tokens instead — the same
   mechanism the leap already used, and one that an overlay can outshine.
2. The leap re-walked the column on every scroll frame, at 106ms worst. Two
   attempts to make the walk cheaper both made it worse (224ms, then 129ms):
   finding the visible window at all means reading rects that
   `content-visibility` had deliberately skipped, which lays out what it had
   skipped. The leap now ends on scroll instead, which is also the honest
   behaviour — a label is a promise about a view that scrolling invalidates.

## H1 — `j` and `k` focus a block — `done`

Delivered behavior: in a thread column, `j` and `k` move a focus ring from
block to block, the focused block is at full opacity and every other block is
at 50%, the focused block scrolls itself into view, and `esc` gives the column
back its plain look.

Steps:

1. New `src/renderer/src/lib/blocks.ts` — pure, no Svelte:
   - `export interface NavBlock { id: string; kind: Block['kind'] | 'tool';
     blockId: string; rowId?: string; checkpointId?: string; label: string }`.
   - `id` is what the focus state stores and the DOM registers under. Build it
     as `${blockId}` for a whole block and `${blockId}:${rowId}` for a tool
     row, so it is unique without a counter.
   - `export function navBlocks(blocks: Block[]): NavBlock[]`. Walk `blocks`;
     skip `kind === 'checkpoint'` but remember the last one seen, and hand its
     `id` to the next `user` block as `checkpointId` (clear the memory after
     attaching, and after any non-checkpoint, non-user block, so a checkpoint
     never travels past its own message). A `ledger` block contributes one
     entry per element of `rows` — top level only, ignore `children`.
   - `label` is for the leap hints and the menu header: the first 40 characters
     of `text` for messages, `${row.kind} ${row.target}` for tool rows, the
     card's own name for cards.
   - `export function step(list: NavBlock[], current: string | null, delta:
     number): string | null` — clamps at both ends, returns `list[0]?.id ??
     null` when `current` is null and `delta > 0`, and the last id when
     `current` is null and `delta < 0`.
2. New `src/renderer/src/lib/blocks.test.ts`: a ledger of three rows yields
   three nav blocks; a checkpoint yields none and lands its id on the next user
   block; a checkpoint with no user block after it is dropped; nested children
   are not counted; `step` clamps rather than wrapping.
3. New `src/renderer/src/lib/state/block-focus.svelte.ts`:
   - A registry mirroring `state/columns.ts`: `registerBlock(threadId, navId,
     el): () => void` into a `Map<string, Map<string, HTMLElement>>`, and
     `revealBlock(threadId, navId)` calling
     `el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
   - `class BlockFocus { focused = $state<Record<string, string | null>>({}) }`
     keyed by thread id, plus `idOf(threadId)`, `set(threadId, navId)`,
     `clear(threadId)`, and `move(threadId, list, delta)` which calls `step`,
     stores the result and calls `revealBlock`.
   - Export the singleton as `blockFocus`.
4. `src/renderer/src/lib/keyboard.ts`:
   - Replace `{ type: 'scrollColumn'; delta: number }` in `Action` with
     `{ type: 'moveBlock'; delta: number }`. Keep `SCROLL_STEP` exported — the
     shell still uses it for terminal columns.
   - In `reduceKey`, `case 'j'` emits `{ type: 'moveBlock', delta: 1 }` and
     `case 'k'` emits `delta: -1`.
5. `src/renderer/src/lib/state/shell.svelte.ts`, `run()`:
   - Replace the `scrollColumn` case with `moveBlock`: when
     `app.thread.terminal`, call `scrollColumn(app.thread.id, action.delta *
     SCROLL_STEP)` exactly as today; otherwise call `blockFocus.move(
     app.thread.id, navBlocks(threads.get(app.thread.id).blocks),
     action.delta)`.
   - In the `Escape` path — `handleKey` sees the reduced state, so do it where
     `blurComposer` is handled and also when the reducer returns to NORMAL with
     no overlay — call `blockFocus.clear(app.thread.id)`.
   - In the `focusComposer` case, clear the focus of the thread being typed
     into: the transcript should not stay half-dimmed behind a live caret.
6. `src/renderer/src/components/thread/ThreadView.svelte`:
   - Compute `const nav = $derived(navBlocks(shown))` and
     `const focused = $derived(blockFocus.idOf(threadId))`.
   - Wrap each rendered block in a `<div class="block" class:dim>` carrying
     `data-nav-id`, and register it with a small `{#snippet}` or an `$effect`
     per element. A ledger needs one wrapper **per row**, not per block — this
     means `Ledger.svelte` takes a new optional prop `navIds: Record<string,
     string>` (row id → nav id) and a `focusedRow: string | null`, and applies
     the dim class on `.entry` itself. Keep the ledger's own markup otherwise
     untouched.
   - The focused wrapper gets `opacity: 1`; every other wrapper gets
     `opacity: 0.5` and a `transition: opacity 0.12s`. Apply the dim class only
     when `focused !== null`.
   - Do not add `content-visibility` overrides: `ThreadColumn.svelte` sets it
     on `.body > *`, and the new wrappers become that child. Confirm in the
     running app that a focused block off-screen still scrolls into view — a
     `content-visibility: auto` element does report a layout box, but verify
     rather than assume.
7. `src/renderer/src/lib/keyboard.test.ts`: rename the `scrollColumn`
   assertions to `moveBlock` with `delta: 1` / `-1`.

Acceptance: open a thread with a mixed transcript (messages, a ledger of
several tools, a compaction). Press `j` — the first block goes bright and the
rest go dim. Press `j` four more times — the focus walks each tool row
individually. Press `k` past the top — it stops at the first block, it does not
wrap. Press `esc` — every block is at full opacity again. Focus a terminal
column and press `j` — the xterm viewport scrolls as before.

Validation: `blocks.test.ts`; a state test for `block-focus` covering set,
clear and clamping; updated `keyboard.test.ts`; CDP pass in the real app for
the dim classes and for scroll-into-view on an off-screen block; `pnpm check`.

Blocked by: —

## H2 — `ctrl-u` and `ctrl-d` page the transcript — `done`

Delivered behavior: `ctrl-d` moves down half a viewport, `ctrl-u` moves up half
a viewport, and the block focus lands on the first block now at the top of the
view instead of being left behind.

Steps:

1. `src/renderer/src/lib/keyboard.ts`:
   - Add `{ type: 'page'; delta: number }` to `Action`.
   - The `if (event.altKey || mod) return result(state, [], false)` bail-out
     currently swallows every control chord. Insert the page handling **above**
     it and **below** the existing `⌘K` branch: when `event.ctrlKey` and not
     `event.metaKey` and not `event.altKey`, `d` emits
     `{ type: 'page', delta: 1 }` and `u` emits `delta: -1`. Guard on the same
     `typing` condition the letter bindings use, so `ctrl-u` in the composer
     still means "clear the line" to the textarea.
   - The TERM early-return already sits above this, so a shell keeps both
     chords. Verify that branch is still first.
2. `src/renderer/src/lib/state/block-focus.svelte.ts`:
   - Add `page(threadId, list, delta)`: find the registered element for each
     nav id, read the column's scroll box from the focused element's
     `offsetParent`-independent `getBoundingClientRect()`, scroll by half the
     visible height, then set focus to the first nav block whose top is at or
     below the new viewport top. Fall back to `step` by one when no element is
     registered (a column that has never painted).
   - Register the column's own scroller height through `columns.ts` rather than
     re-deriving it: add `registerColumnBox(id, el)` next to
     `registerColumnBody` returning the element, or store the element in the
     same map. Do not query the DOM by class name.
3. `src/renderer/src/lib/state/shell.svelte.ts`, `run()`: handle `page` —
   terminal columns call `scrollColumn(id, delta * viewportish)` (reuse the
   existing xterm scroll path; a half-page for a pty is `scrollColumn` with a
   larger step, and xterm's own `scrollPages` is not reachable from here), and
   thread columns call `blockFocus.page`.

Acceptance: in a long thread press `ctrl-d` twice — the view moves down about
one screen in total and the focus ring is on a block near the top of the
visible area each time. `ctrl-u` reverses it. At the bottom of the transcript
`ctrl-d` stops rather than wrapping. In the composer, `ctrl-u` still clears the
line.

Validation: `keyboard.test.ts` for the two chords and for the typing guard; a
`block-focus` test with stub elements returning fixed rects; CDP pass in the
real app; `pnpm check`.

Blocked by: H1

## Amendments after use (2026-08-16)

22. **`ctrl-d` and `ctrl-u` only move the ring when the reader is already in
    READ.** H2 paged the ring from NORMAL too, which lit one block and dimmed
    every other one. Skimming is not navigating: a reader who has not asked to
    point at anything gets a scroll and stays in NORMAL. The reducer picks
    between a `page` action and a `scroll` action by mode, so the two paths
    cannot disagree about which one is running.
23. **A reveal brings the name above a block with it.** The ring lands on a
    paragraph, but a message's name — YOU, or the agent's — is drawn above the
    first thing the ring can land on and is not a block anyone can point at.
    Aligning the block alone put the name just off the top, so the reader
    arrived at a paragraph with nobody attached to it. The reveal now walks up
    and takes in whatever sits immediately above and is not itself a block. It
    is a y coordinate rather than an element, because the turn's name is a
    sibling of the block's wrapper and no single element's box is the answer.
24. **Programmatic scrolling runs on our own curve, not the browser's.**
    `behavior: 'smooth'` is about 400ms and eases at both ends, which reads as
    sluggish under a keyboard. 130ms, easing out only: the first frame already
    shows the direction, and the move settles rather than stopping dead.
    Measured in the app at 125ms for a half-page. A second keypress adds to
    where the scroll is *going*, not to where it currently is, or a fast repeat
    would move less than it is worth.

## H3 — `s` leaps to any visible block — `done`

Delivered behavior: pressing `s` paints a short label on every block currently
in view; typing the label moves the focus straight there; `esc` or any
non-matching key cancels without moving anything.

Steps:

1. New `src/renderer/src/lib/leap.ts` — pure:
   - `export const LEAP_KEYS = 'asdfghjklqwertyuiop'` (home row first, and
     deliberately excluding nothing — the hint mode owns every key while it is
     on, so a hint labelled `j` is not ambiguous with the `j` binding).
   - `export function labelsFor(count: number): string[]` — single characters
     while `count <= LEAP_KEYS.length`, two characters after that, never a
     label that is a prefix of another.
   - `export function matchLabel(labels: string[], typed: string): { hit:
     number | null; live: boolean }` — `hit` is the index of an exact match,
     `live` says whether any label still starts with `typed`. A `live: false`
     with no hit is how the caller knows to cancel.
2. New `src/renderer/src/lib/leap.test.ts`: 5 blocks get 5 one-character
   labels; 30 blocks get two-character labels with no prefix collisions;
   `matchLabel` reports partial, exact and dead.
3. `src/renderer/src/lib/state/block-focus.svelte.ts`:
   - Add `leap = $state<{ labels: string[]; ids: string[]; typed: string } |
     null>(null)`.
   - `startLeap(threadId, list)` — filter `list` to the nav ids whose
     registered element intersects the column's box (compare rects; no
     IntersectionObserver, the read happens once per keypress), assign labels,
     store. When nothing is visible, do not enter the mode.
   - `typeLeap(threadId, key)` — appends, calls `matchLabel`, and on a hit sets
     focus and clears the mode; on a dead end clears the mode and leaves focus
     alone.
   - `cancelLeap()`.
4. `src/renderer/src/lib/state/shell.svelte.ts`, `handleKey()`:
   - Above the `confirm.pending` check is wrong — the destructive modal still
     outranks a hint. Put the leap branch immediately **below** the
     `commit.open` branch and above `pendingClose`: when
     `blockFocus.leap !== null`, `Escape` and any modifier chord cancel, a bare
     modifier key is ignored (reuse `MODIFIER_KEYS`), and everything else goes
     to `typeLeap`. Always return `true`.
   - In `run()`, handle a new `{ type: 'leap' }` action by calling
     `blockFocus.startLeap` for thread columns and doing nothing for terminal
     columns.
5. `src/renderer/src/lib/keyboard.ts`: `case 's'` in `reduceKey`'s NORMAL
   switch emits `{ type: 'leap' }`. `s` is unbound today — confirm before
   adding.
6. `src/renderer/src/components/thread/ThreadView.svelte` and
   `Ledger.svelte`: when a nav id has a leap label, render it as a small
   absolutely-positioned chip at the block's top-left, in `--font-chrome`, on
   `--accent`. While the hint mode is on, dim is suspended — the labels must be
   readable on every candidate.
7. `src/renderer/src/components/overlays/KeymapOverlay.svelte`: add `s`,
   `ctrl-u`, `ctrl-d` and `a` (H4) to the listed bindings.

Acceptance: in a thread with ten visible blocks press `s` — ten labels appear.
Type one — the focus jumps to that block and the labels vanish. Press `s` then
`esc` — nothing moved. Press `s` then a letter no label starts with — the mode
ends and the focus is where it was. Press `s` in a terminal column — nothing
happens.

Validation: `leap.test.ts`; a `block-focus` test driving `startLeap` /
`typeLeap` against stub elements; a `shell` test proving the confirm modal and
the commit card still outrank the hint mode; CDP pass; `pnpm check`.

Blocked by: H1

## H4 — `a` opens a block menu; the checkpoint separator retires — `done`

Delivered behavior: `a` on a focused block opens a small menu beside it with
`copy` and, on a user message, `restore checkpoint`. The dashed CHECKPOINT rule
is gone from the transcript.

Steps:

1. New `src/renderer/src/lib/state/block-menu.svelte.ts`:
   - `open = $state<NavBlock | null>(null)`, `index = $state(0)`,
     `confirming = $state(false)`.
   - `actionsFor(block: NavBlock): { id: 'copy' | 'restore'; label: string }[]`
     — `copy` always; `restore` only when `block.checkpointId` is set and
     `catalog.source === 'live'` (the demo catalog has no thread behind it, the
     same guard `ThreadView` already applies through `wired`).
   - `handleKey(event)` — `j`/`k`/arrows move `index`, `⏎` runs the highlighted
     row, `esc` closes. Inside the menu `⏎` is the right key: the menu is a list
     with a highlight, exactly like the palette and the switcher, and it is
     modal, so nothing else wants the key. Restore sets `confirming` first and
     takes a second `⏎`; the copy in
     `Checkpoint.svelte`'s confirm block ("This rewinds the conversation to
     here. Your files keep every later edit — nothing on disk is undone.") is
     the wording to keep, verbatim.
   - `run()` — `copy` writes the block's text to the clipboard via the same
     `navigator.clipboard.writeText` + swallow-failure shape as
     `yankNewestCodeBlock` in `shell.svelte.ts`; extract that shape into one
     helper rather than writing it twice. `restore` calls
     `threads.restore(threadId, block.checkpointId)`.
2. `src/renderer/src/lib/state/shell.svelte.ts`, `handleKey()`: add a branch
   for `blockMenu.open !== null` beside the `commit.open` branch — same
   precedence rule, same shape. It must sit above the H3 leap branch: a menu
   is modal and a hint mode is not.
   `keyboard.ts` gains `case 'a'` in `reduceKey`'s NORMAL switch, emitting
   `{ type: 'openBlockMenu' }`. `a` is unbound today — confirm before adding.
   The reducer does not know whether a block is focused, so it always emits;
   `run()` drops the action when `blockFocus.idOf(app.thread.id)` is null or
   the column is a terminal.
3. New `src/renderer/src/components/thread/BlockMenu.svelte`: absolutely
   positioned against the focused block's wrapper, rows in `--font-chrome`, the
   highlighted row in `--accent`, the confirm state reusing the warn styling
   from `Checkpoint.svelte`. Roughly 90 lines — copy the styles across rather
   than importing them, then delete the source.
4. `src/renderer/src/components/thread/ThreadView.svelte`: delete the
   `checkpoint` branch and the `Checkpoint` import; render `BlockMenu` when
   `blockMenu.open` names a block in this thread.
5. Delete `src/renderer/src/components/thread/Checkpoint.svelte`.
6. `src/renderer/src/lib/thread-turn.ts`: `BETWEEN` and `NEUTRAL_BLOCKS` both
   list `'checkpoint'`. The block still exists in the model — only its
   rendering goes — so **leave both sets alone**. Confirm
   `thread-turn.test.ts` still passes unchanged; if it does not, the block
   stopped being emitted somewhere and that is a bug, not a test to update.

Acceptance: focus a user message, press `a` — a menu shows `copy` and
`restore checkpoint`. Focus an agent message — the menu shows `copy` only.
Press `a` with no block focused — nothing happens. Restore asks once and only
rewinds on the second `⏎`. No dashed CHECKPOINT
rule appears anywhere in the transcript. The agent-label grouping above each
turn is unchanged.

Validation: a `block-menu` state test for `actionsFor`, key handling and the
two-step restore; a `shell` test for menu precedence against the confirm modal;
`thread-turn.test.ts` passing untouched; CDP pass driving a real restore;
`pnpm check`.

Blocked by: H1

## Order

H1 → {H2, H3, H4}
