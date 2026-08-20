# Agent Peek Dialog — Tickets

Spec: [2026-08-20-agent-peek-dialog.md](../../specs/2026-08-20-agent-peek-dialog.md).
Three vertical slices; P1 and P2 are independent, P3 lands the new surface on
top of both so the header and footer are built once.

## P1 — Usage counts while the child runs — **done**

**Delivered behavior**: open the peek on a running child and the
`tokens · cost` line climbs as the child works, ending exactly at the settled
figure.

Low level:

- `driveChild` (`src/main/session/agent-run.ts`) gains an `onUsage` callback
  in its options, invoked after each assistant `message_end` once `add()` has
  folded that message's usage in, with a fresh copy (`{ ...usage }`) — never
  the mutable accumulator.
- `AgentFleet.#turn` (`src/main/session/agent-fleet.ts`) passes
  `onUsage: (usage) => this.#emit(parent.threadId, { kind: 'agent-update', id, agent: { ...entry, usage } })`.
  The entry spread keeps status `running`; the settle path is untouched, and
  `SpendBook.charge` still runs only in `#settle`.
- Renderer: no change. `agent-update` already replaces the entry and
  `AgentPeek.svelte`'s `cost` is `$derived` off it.

**Acceptance criteria**:

1. While a child runs, successive `agent-update` events carry monotonically
   growing usage; the peek re-renders the figure without reopening.
2. The final settled entry's usage equals the last live figure plus nothing —
   settle emits the same accumulator it always did.
3. `threads.spentIn` / the status bar figure is charged exactly once per
   child (no double count from live updates).

**Validation**: fleet test with a fake session emitting two assistant
messages — assert two `agent-update` events with growing usage, one
`SpendBook` charge, final entry matches. Existing `agent-fleet.test.ts`
patterns fit.

**Blocked by**: nothing.

## P2 — The entry names its effective model — **done**

**Delivered behavior**: the peek shows the model id the child actually runs
on, including when main fell back from an unconfigured role model.

Low level:

- `AgentEntry` (`src/shared/vocabulary.ts`) gains `model?: string` — the
  resolved id, absent on pre-change recordings.
- `SessionFactory.child` (`src/main/session/session-factory.ts`): resolve
  the model once into a local (`await this.#childModel(...)`), pass it to
  `createAgentSession`, and return the resolved id alongside the session —
  change the return shape to `{ session, model }` (or an equivalent out
  param) so the fleet learns what `#childModel` chose, fallback included.
  `ChildFactory` in `agent-types.ts` and the test fakes update with it.
- `AgentFleet.run`: stamp `model` onto the `started` entry before the
  `agent-update` that announces the child started, so every later emit
  (P1's usage updates, settle) carries it via spread.
- `AgentPeek.svelte` header: render `entry.model` after the role, truncated
  with `title` holding the full id; render nothing when absent.

**Acceptance criteria**:

1. A spawn whose role names a configured model produces an entry with that
   id.
2. A spawn whose role names an unconfigured model produces an entry carrying
   the session's fallback model id, and the existing `onWarning` still fires.
3. A replayed thread recorded before this change opens in the peek with no
   model line and no error.

**Validation**: fleet test asserting `entry.model` on the started update for
both paths; renderer smoke via existing peek tests plus one assertion on the
absent-model branch.

**Blocked by**: nothing.

## P3 — The floating chat-column dialog — **done**

**Delivered behavior**: `l` on a focused agent row opens a centered floating
column over a dimmed strip — brief as a sent message, calls as ledger-style
rows, report as markdown — with the live figures from P1 and the model from
P2 in its chrome.

Low level:

- `AgentPeek.svelte` rebuilt as a dialog shell: centered, column-width
  (match the diff viewer's shell metrics), `max-height` most of the
  viewport, strip dimmed behind by a background step — no borders, per
  borderless-chrome. Mount point stays `App.svelte`.
- Header: `Identicon` + name + role + model (P2) + status mark + live
  elapsed. Footer: live `tokens · cost` (P1) + key hints.
- Brief: `entry.label` styled as a sent message block.
- Calls: reuse the row vocabulary — `labelFor` grammar, running pulse,
  children of the child indented one step. Extract a small shared row
  presentational piece from `ToolLine`/`AgentRow` only if reuse demands it;
  do not fork the grammar.
- Report: `entry.output` through the markdown pipeline
  (`parseMarkdownCached` + the thread's md components), styled as an
  assistant message.
- Key contract untouched: `agent-peek.svelte.ts` state class does not
  change. `h`/`escape` close, `x` confirms-then-stops while running,
  everything else falls through.

**Acceptance criteria**:

1. The peek draws centered over the strip; the strip stays visible behind a
   dim step and keeps streaming.
2. Calls render with the ledger's grammar and pulse while running; the
   report renders markdown (headings, fences) rather than plain text.
3. All of `agent-peek.test.ts` stays green unmodified — the key contract and
   self-closing rules are byte-identical behavior.
4. A long-running noisy child scrolls inside the calls region; the dialog
   itself never overflows the viewport.

**Validation**: existing peek state tests unchanged; visual pass in
`pnpm dev:web` against the design reference; motion judged in the Electron
window per `docs/quality.md`.

**Blocked by**: P1, P2 (chrome shows both; building the header/footer once).
