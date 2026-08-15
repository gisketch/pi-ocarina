# Exec Plan: Live Thread & Ledger

Spec: [2026-08-15-thread-ledger.md](../../specs/2026-08-15-thread-ledger.md).
Visual truth: `PiOcarina Components.dc.html` sections 04, 05, 08, 09, 11 — the
static interiors from milestone 1 already match them; this plan makes the same
pixels live.

Status legend: `todo` · `in-progress` · `done`.

## C1 — Thread reducer — `done`

> Verified: all five reference threads project from recorded streams to exactly
> the milestone-1 hand-written blocks (compared field by field; only ledger
> block ids, which are render keys, and explicitly-false `streaming`/`open`
> flags differ). Two contract points settled and written into the spec:
> `status` vs `runState`, and the new `tool-progress` event.

- Delivered behavior: a pure reducer `(viewModel, uiEvent) → viewModel` producing
  the spec's block list (`user-message`, `agent-message`, `ledger-group`, `ask`,
  `approve`, `checkpoint`, `compaction`, `queued-steer`) and thread status. Live
  and replay run through this one function; unknown event kinds become visible
  fallback rows (raw kind shown), never dropped. The milestone-1 mock fixtures
  are re-expressed as recorded event streams so the static shell keeps rendering
  from reducer output.
- Acceptance: every reference thread renders identically from reducer output as
  it did from hand-written fixtures; unknown-kind, error-path, and
  subagent-interleaving streams produce the specced view models.
- Validation: reducer fixture tests (recorded streams → expected view models),
  including out-of-order tool settlement and interleaved threads; `pnpm test`.
- Blocked by: B1 (event vocabulary)

## C2 — Live streaming render — `done`

> Verified: the reference columns render byte-identically from the live store,
> and their header dots now come from the reducer (`retry backoff` reads
> `waiting-input` on its open question, per the spec, where the static mock said
> `done`). Picked up two things C2 had to own: the switcher's "pin a folder…"
> card is wired to a native picker (B3 left the UI for C2), and the seam-demo
> scaffolding is deleted now that threads render the stream themselves.
> Rendering the new block kinds for the first time exposed a reducer bug —
> `compaction-done` with no matching start was dropped, leaving the shimmer
> running forever. Orphaned decisions now surface instead of vanishing.
> **Outstanding for the user:** the DevTools frame capture of a streaming burst
> on real hardware. The one-assignment-per-batch property it depends on is
> covered headlessly.

- Delivered behavior: thread columns render reducer output from the live driver
  stream: agent text grows with the blinking caret, ledger rows appear as tools
  start and flip status as they settle, running rows pulse, bodies render lazily
  on first expand. Renderer applies coalesced batches in one DOM pass per frame.
  Column header status dots track thread status. Mock threads retired for
  driver-backed workspaces.
- Acceptance: a real prompt streams into a column with no visual divergence from
  the reference vocabulary; a 60-token burst causes one DOM pass (measured);
  expansion still lazy.
- Validation: component smoke tests mounting reducer-produced view models;
  DevTools performance capture of a streaming burst; visual review vs reference.
- Blocked by: C1, B2

## C3 — Interactive cards live — `done`

> Verified against real pi: the live tests now assert the *rendered* card, not
> just the event — approvals resolve to `deny` then `always`, a rewound thread
> renders as one conversation, a delivered steer leaves no QUEUED row, and a
> compaction always stops running. That last one found a bug: pi refuses to
> compact a small session, and the refusal was a `raw` note with no id, so the
> shimmer ran forever. `compaction-skipped` is now a named event carrying the
> id it ends.
>
> Two scope notes. **pi 0.84 never emits an `ask`**, so the ask card is
> mock-only today. Building a producer is its own spec,
> [2026-08-15-ask-tool.md](../../specs/2026-08-15-ask-tool.md), which needs
> grilling. **`undo` on the compaction card is not built, and will not be** —
> nothing in pi can restore a compacted context, and a dead button is worse than
> no button. Composer-reply-answers-an-ask lands with D1, which owns send.

- Delivered behavior: ask card answers via `answerAsk` (click or composer
  reply resolves it); approve card drives `resolveApproval` with allow-once /
  always / deny and shows the resolved outcome inline; checkpoint divider's
  `restore` confirms with the honest copy ("rewinds the conversation; your files
  keep later edits") then issues `restoreCheckpoint`; queued-steer row renders
  with cancel ✕ wired to the driver; compaction shows the pixel-shimmer running
  state and the summary card (before→after ctx, `expand original`, `undo`).
  Pending ask/approve puts the thread in `waiting-input`.
- Acceptance: each interaction round-trips through the real driver and the
  ledger reflects the outcome (`denied` row, answered ✓, restored fork opens,
  cancelled steer disappears).
- Validation: headless tests dispatching card interactions against a scripted
  driver; integration pass on a real session; visual review.
- Blocked by: C2, B4, B6

## C4 — Subagents, errors, skeletons — `done`

> Verified in the running app: denied rows red, timeout amber, cancelled struck
> through, subagent children indented one level, the failed thread showing a red
> header dot and its error row. Found and fixed a real misreport — pi says only
> `isError`, so a command **the user refused** was rendering as a command that
> **broke**. The approval gate now records the blocked `toolCallId` and the
> translator maps it to `denied`.
>
> Scope notes, since pi 0.84 produces none of these:
> **Subagents** are not a gap to work around but something this app will build —
> moved to its own spec, [2026-08-15-subagents.md](../../specs/2026-08-15-subagents.md),
> which needs grilling. The nesting rule and renderer stay here, built and
> fixture-tested; only the producer is missing.
> **`timeout` is removed** from the vocabulary — no producer, and a status the
> ledger cannot keep is worse than none. **`cancelled` gained a real producer**:
> cancelling a turn now settles the calls pi abandoned, which previously left
> rows pulsing as running forever. **Retry is per-turn, decided** — pi retries
> turns, not calls, and the failed-thread row is wired to `retryTurn`.

- Delivered behavior: `agent` rows nest child tool rows one level deep; parallel
  subagents render as independently-updating sibling rows. Timeout rows offer
  retry, cancelled rows render struck-through, denied in error color; thread
  `failed` shows the red header dot and an error row with manual retry wired to
  `retryTurn`. History replay on thread open shows `steps()`-only skeletons
  until the projection catches up.
- Acceptance: a fixture stream with two interleaved subagents renders correctly;
  every error state matches the reference; skeletons never use continuous
  easing.
- Validation: reducer fixtures for subagent interleaving and every
  status; component smoke per error variant; visual review vs Components
  sections 08/11.
- Blocked by: C2

## C5 — Virtualized scrollback & perf budget — `done`

> Measured on a real 5,000-block thread (80,000px of scrollback), sweeping the
> whole column in 120 steps and timing the layout each step. Budget is 8.34ms
> (120Hz):
>
> | | median | worst | steps over budget |
> |---|---|---|---|
> | scroll, as shipped | 1.8ms | 2.3ms | **0 / 118** |
> | scroll, `content-visibility` disabled | 12.3ms | 13.8ms | **118 / 118** |
> | 60-token burst into the same thread | 3.9ms | 5.7ms | **0 / 58** |
>
> The control run is the point: without containment every single frame would
> drop. Expand/collapse verified across a scroll round trip.
>
> Scope note: virtualization is `content-visibility`, not JavaScript windowing.
> Off-screen blocks are skipped by layout and paint but stay in the DOM, so
> expansion state, scroll anchoring, text selection and find-in-page keep
> working — a hand-rolled window silently breaks all four. The numbers above are
> the evidence that it is sufficient.

- Delivered behavior: long threads virtualize scrollback; collapsed bodies use
  `content-visibility`/`contain`; markdown blocks keep the reference chrome
  (inline code, lists, fenced blocks; `y` copies the newest fenced block —
  highlighting may defer).
- Acceptance: a 5k-block thread scrolls without visible jank and a scripted
  streaming burst into it drops no frames at 120Hz (DevTools capture); expand/
  collapse state survives virtualization.
- Validation: scripted perf harness with frame measurements; scroll-position
  and expansion-state tests across virtualization boundaries.
- Blocked by: C2

## Order

C1 → C2 → {C3, C4, C5}
