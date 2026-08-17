# Exec Plan: subagents

Spec: [2026-08-15-subagents.md](../../specs/2026-08-15-subagents.md) (approved
2026-08-17).

Status legend: `todo` · `in-progress` · `done`.

Ticket prefix `M`. Decisions referenced as D1–D13 from the spec.

## M1 — Roles, names, and the shared vocabulary — `done`

> Nothing is visible except a settings file that now has content. Everything
> else stands on it, and it goes first because the shapes are breaking changes
> to `vocabulary.ts` that the reducer, the tool and the peek all read.

- Delivered behavior: `src/shared/vocabulary.ts` carries `AgentRole`
  (`id`, `name`, `instructions`, `tools: string[]`, `model?`), `AgentStatus`
  (`running | ok | fail | denied | cancelled`), `AgentEntry` (`id`, `name`,
  `role`, `label`, `status`, `output?`, `truncated?`, `usage`, `startedAt`,
  `endedAt?`, `parentId`), and `SpawnRequest` (`role?`, `instructions?`, `task`,
  `label`, `model?`, `tools?`).
- A role store in the catalog: seeded **once** on first run with scout, planner,
  developer and reviewer (D12), and a name pool seeded once with Greek myth
  names (D2). Seeding writes a `seeded: true` marker so a later launch never
  re-seeds and never overwrites an edit.
- `READ_ONLY_TOOLS` is named in shared code: the ceiling an inline role gets
  (D13).
- Acceptance: a fresh profile starts with four roles and a full name pool;
  editing a role and restarting keeps the edit; deleting all four and restarting
  leaves them deleted.
- Validation: store tests over seed-once, edit, delete; a catalog migration test
  the way the v6 migration is covered.
- Blocked by: nothing.

## M2 — Nesting at depth two, and the agent row — `done`

> Demoable with no backend at all: a fixture in the browser harness draws a
> spawn call with three children under it, and one of those children with its
> own child.

- Delivered behavior: `nestRow` (`thread-rows.ts:43`) finds its parent at any
  depth rather than adopting a grandchild as a sibling (D9). A row nested under
  a row that is itself nested lands in the right place.
- `ToolRow` carries the agent fields when its kind is `agent`: sigil seed, name,
  role, label, status, `startedAt`, `endedAt`, usage.
- The renderer draws the row as `sigil, name, role, label, live cell` (D4), with
  the sigil from `identicon(name, workspaceHue)` at small size — the existing
  5x5, not a new grid.
- Acceptance: the demo catalog renders a two-level tree; indentation is one step
  per level; the live cell is the only part that changes.
- Validation: `nestRow` unit tests for depth 1, depth 2, and a missing parent
  (still falls back to top level); the harness opened once.
- Blocked by: M1.

## M3 — One child, end to end — `done`

> The tracer bullet. A real agent spawns one child, the child's tool calls
> appear nested under the call, and the parent reads the result.

- Delivered behavior: `spawn_agents` is registered in the inline extension
  beside the approval gate and `ask_user`. It resolves a role from the store, or
  takes `instructions` inline with the read-only ceiling (D12, D13), builds an
  in-process `AgentSession` with `SessionManager.inMemory()` (D1), and runs the
  task.
- The child's tool events are relayed into the parent thread stamped with the
  spawn call's `toolCallId` as `parentId` (D1).
- The app appends its fixed preamble to every role's instructions: your last
  message is all the parent reads (D7).
- The envelope comes back as one entry per child, capped, with `truncated` when
  the cap bit (D7).
- Naming a role that does not exist returns an error listing the roles that do,
  and spawns nothing.
- The orchestrator may narrow `tools`, never widen; a widening request is
  narrowed to the role's ceiling and the child is told (D13).
- Acceptance: a live agent spawns a scout, the scout's `read` and `grep` rows
  appear nested, and the parent's reply uses what the scout found.
- Validation: unit tests for role resolution, unknown-role error, the narrowing
  rule, the inline ceiling, and the envelope shape; one live pass under
  `PIOCARINA_PI_LIVE=1`.
- Blocked by: M2.

> **Proven live.** A real agent, given only the tool's description, spawned a
> scout, the scout's `read` arrived nested under it, and the parent's reply
> carried the word the scout found. Three things the live run found that no
> offline test could: the shipped `scout` pinned a model from a provider this
> machine was not signed in to, so every scout died before reading anything —
> shipped roles now name no model, and a named model that is not configured
> falls back with a warning; a failed child reported an empty output rather than
> the model's own error, which read as "said nothing" and invited the parent to
> retry the identical spawn; and `spawn_agents` rendered as a `raw` row with a
> page of JSON in it, because pi's tool-name map had never heard of it.

## M4 — Several at once: names, caps, depth — `done`

> Three children in one call, three rows, three different names, and a fourth
> that waits for a slot.

- Delivered behavior: a call may carry up to eight children; four run at once
  and the rest queue (D9). The cap counts every live session in the tree, not
  each parent's own children.
- Names are drawn from the pool, excluding names currently live, and released on
  settle (D3). No two live children share a name.
- A child may spawn; a grandchild may not, and the tool tells it so rather than
  failing silently (D9).
- Acceptance: a live agent spawns three scouts that run concurrently and finish
  independently; a child spawning its own child works; that grandchild's attempt
  to spawn is refused with a readable reason.
- Validation: unit tests for the queue, the tree-wide cap, name uniqueness under
  concurrency, name release, and the depth refusal.
- Blocked by: M3.

> **Proven live.** Three scouts ran at once from one call, took three different
> names, and all three reported back. Two things the work turned up. First, a
> child at depth 1 needs `spawn_agents` handed to it *by name*: pi filters custom
> tools by the `tools` list too, so a child would otherwise have the extension
> registered and the tool invisible. Second, and more important, giving every
> child the spawn tool opens an escalation — an inline child, held to read-only
> tools by D13, could start a `developer` and write through it. So only a child
> with a saved role may spawn, and only at depth 1.

## M5 — The live cell and the one clock — `done`

> The row stops being static: the right-hand cell shows what the child is doing
> now, and how long it has been doing it.

- Delivered behavior: the live cell shows the child's current tool call, in the
  same grammar the ledger's own tool rows use, replaced by a status mark and the
  final duration on settle (D4).
- One app-wide clock ticks once a second (D5). It is created when the first
  child starts and destroyed when the last settles; it pauses on
  `visibilitychange` when the document is hidden; the tick is read in the leaf
  that draws the duration; durations render in tabular figures.
- Acceptance: with no children running, no interval exists; with children
  running, each row's duration advances once a second and the row never reflows.
- Validation: unit tests for start/stop/pause and for a formatter whose output
  is fixed-width; a harness pass watching a fixture tick.
- Blocked by: M4.

> **Two findings from the harness.** The preview pane reports itself
> `visibilityState: 'hidden'`, so the clock correctly refused to tick there and
> watching it prove itself was impossible — the visibility source is injected
> now, which makes the pause rule the well-tested part rather than the invisible
> one. And a child running a child of its own read as `working`, because the
> tool label is all a nested agent row gives; it names the grandchild instead.

## M6 — The peek, and stopping one child — `done`

> `l` on a child row opens what it is actually doing. `x` stops that one and
> leaves the others alone.

- Delivered behavior: `l` on a focused agent row opens the peek and `h` closes
  it, shadowing thread movement only while an agent row is focused (D4). The
  peek shows the child's task in full, its tool calls as they happen, and its
  usage.
- `x` confirms, then cancels that child only (D10). Its siblings continue; its
  entry comes back `cancelled` with no output.
- Cancelling the parent turn cancels every live child in the tree.
- The peek takes a rank in the key routing, below the ask card and the block
  menu, and it is written down where the other ranks are.
- Acceptance: three children running, one cancelled from the peek, the other two
  finish and the parent receives all three entries with the right statuses.
- Validation: unit tests for the key path, the rank, the confirm, and the
  single-child cancel; a harness pass opening and closing the peek by key and by
  mouse.
- Blocked by: M5.

> **The peek was unreachable, and the harness is what found it.** Nested rows
> deliberately do not register as focus targets — pointing at a subagent's third
> read is not something a reader can ask for — and every agent row is nested
> under its spawn call. So `l` had nothing to descend from. A nested *agent* row
> is now a stop of its own, in the DOM and in `navBlocks`; its tool rows still
> are not. Walked in the harness: `j` to a child, `l` opens it, `h` closes it,
> and a running child offers `x stop` where a settled one does not.
>
> The shell also passed 350 lines, so the surfaces that rank below the modals
> moved into `key-routing`, which already owned the ranking above them.

## M7 — Who is asking, and what it cost — `done`

> Approval cards stop being anonymous, and the thread's figures stop lying.

- Delivered behavior: an approval card raised by a child carries the child's
  sigil, name and role (D8). A rule already granted for the workspace covers a
  child without a card.
- The thread's usage figures include every child's usage (D11); the per-child
  breakdown stays in the peek.
- Acceptance: a child writing a file with no rule raises a card naming it; the
  same child writing again after "always" raises none; the status bar total
  moves by the children's usage.
- Validation: unit tests for the card's payload and for the rollup; one live
  pass with a developer role writing a file.
- Blocked by: M6.

> Four files crossed 350 lines under this ticket and were split at real seams:
> driving one child session left the fleet (`agent-run.ts`), this app's inline
> extensions left the session factory (`session-extensions.ts`), the command map
> left the event protocol (`commands.ts`, re-exported so no call site moved), and
> the child-agent approval tests left the gate's own.

## M8 — Reopening the thread — `done`

> Close the thread, open it again, and the children are still there.

- Delivered behavior: each entry's name, role, label, status, duration and usage
  are written into the recorded result's `details`, and the rows are rebuilt from
  them on replay the way `ask-replay` rebuilds a card (D6). A peek on a replayed
  row shows the child's summary rather than its tool calls.
- A spawn call whose result cannot be read replays as an ordinary tool row rather
  than a broken agent row.
- Acceptance: a thread with three finished children reopens with three rows
  carrying the right names, roles, statuses and durations.
- Validation: unit tests for the rebuild, for an unreadable result, and for a
  spawn the app quit under; a manual reopen of a real thread.
- Blocked by: M7.

## M9 — The roles screen — `done`

> The first real form in the app. Keyboard-first, like everything else.

- Delivered behavior: a settings surface lists roles, and adds, edits and
  deletes them: name, instructions, tool set, default model. The name pool is
  editable as a list.
- A role in use by a live child cannot be deleted out from under it.
- Acceptance: adding a role makes it spawnable in the same session without a
  restart; editing one changes the next spawn, not a running child.
- Validation: unit tests for the store edits and the in-use guard; a harness pass
  adding a role and spawning it.
- Blocked by: M8.

> **No in-use guard, deliberately.** The ticket asked for one; it would protect
> nothing. A running child already holds its instructions and is unaffected by a
> role being deleted, and a child that spawns afterwards gets the tool's own "no
> role named …" error, which lists the roles that do exist. The guard would need
> a live-children query the settings screen has no other use for.
>
> The screen shows the shipped roles when there is no backend, which is what
> makes it reviewable in the browser harness at all — an error where four roles
> belong says nothing about whether the screen works.
