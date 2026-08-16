# Change review: read what the agent wrote

Status: **approved 2026-08-16.** Fifteen decisions settled in the grill and
recorded below. The mode and gutter changes it needs are carried by
[2026-08-16-modes-amendment.md](2026-08-16-modes-amendment.md), which amends the
frozen shell and ledger contracts rather than editing them.

Ranked first in the landscape read
([docs/reference/2026-08-16-agent-harness-landscape.html](../reference/2026-08-16-agent-harness-landscape.html)).

## Problem

PiOcarina shows that files changed. It never shows the change.

Two places are missing it. In the transcript, an `edit` or `write` row draws its
header — path, `+14 −3` — and nothing else: `toolBody()` builds a body for
`bash` and `read` only, so there is no diff to expand. The `diff` body type
exists in `shared/vocabulary.ts` and `ToolBody.svelte` renders it, but only the
mock thread ever emits one. Away from the transcript there is no diff surface at
all: the commit card counts lines and cannot show them.

The loop today ends one step early: the agent writes, and the reader commits
something they have not read.

## Desired outcome

The change is legible where it happened — in the ledger, as the agent makes it —
and there is one place to read all of it together when the row is too small.

## Settled in the grill (2026-08-16)

1. **The change is the tool calls, not the working tree.** `edit` and `write`
   rows are what a reader reviews. A git working-tree diff is a different
   question and is out of scope here.
2. **An `edit` or `write` row opens by default.** These are the rows a reader
   came to read. Every other kind keeps its current default.
3. **The row body is a diff, drawn as the reference draws it**
   (`docs/reference/design/`, section 05): `write` is all additions in green,
   `edit` is `−` in red and `+` in green over dim context.
4. **A row body is capped.** A large edit must not take the column. The cap
   yields to the floating viewer rather than growing.
5. **The block menu opens the full change.** `a` on a capped row offers a way
   into the viewer.
6. **A floating diff viewer, with its own hotkey.** Files on the left, the
   change on the right, vim keys throughout. It must stay fast.
7. **The diff comes from the file, not from the arguments.** The main process
   snapshots the file when a call starts and again when it ends, and diffs the
   two. This is the only source that gives real line numbers and real context
   lines, and the only one that does not break when pi renames a tool argument
   — which matters here, because pi's `edit` argument shape could not be
   confirmed from the SDK bundle or its docs. The costs are accepted: two reads
   per call, a size cap above which the snapshot is skipped, and the fact that a
   file changed by something else during a call is attributed to the agent.

8. **The viewer shows each file once, as one diff; the ledger keeps the
   history.** Two views, two questions, one differ. The ledger already answers
   "what did the agent do", call by call. The viewer answers "what does this add
   up to", and gets there by diffing the snapshot taken before the thread's
   first edit of a file against the snapshot after its last. Both come from the
   same snapshots and the same diff function, so they cannot disagree; they are
   the same data with different endpoints. Accepted cost: a file edited and then
   reverted has no net change and drops out of the viewer's list. It remains in
   the ledger, which is where the history lives.
9. **A tool row states what is happening to it, not only that something is.**
   `read` becomes `reading` while it runs and `read` when it lands; `edit`
   becomes `editing`, then `edited`. Today the label is the same word in every
   state and only a pulsing node says the call is live.

10. **The kind gutter is dynamic, and shared across the ledger.** The
    reference's 36px becomes a minimum, not a fixed width. Two things follow
    from that, and both are the point of the decision rather than details of it:
    the column is measured once for the whole ledger, so every target still
    lines up; and it is sized to the widest label the ledger *could* show, not
    the widest it shows right now. Sizing to the current text would shift every
    target sideways each time a call landed and `reading` became `read`. Rows
    are flex containers today and cannot share a measurement, so the ledger
    becomes the grid and the rows become its items.

11. **The viewer is its own mode, with two panes.** `Mode` gains `DIFF`
    alongside `NORMAL | READ | INSERT | LEADER | TERM`, and the statusbar
    colours it the way it colours READ. The mode owns every key while it is up,
    which is the same contract READ already has and the reason a reader never
    has to guess who is listening.
12. **`d` opens it; `esc` closes it.** `d` is free in NORMAL and in READ — the
    reducer's letter cases are `a c f h i j k l m n s t w x y` — and it is the
    letter the reader is already thinking. `␣ d` does the same thing, so the
    which-key bar can teach it. From READ, `a` on a capped row opens the viewer
    at that row's file, which is decision 5.
13. **A body is capped at 24 lines.** Enough for the edits an agent actually
    makes, short of taking the column. The hidden remainder is stated on the
    row, not silently dropped: `+38 more lines · a`. The translator's existing
    `MAX_BODY_LINES = 40` stays what crosses the wire; 24 is what is drawn.
14. **The viewer follows the thread live.** It is derived from the same
    snapshots the ledger uses, so freezing it on open would show a reader stale
    text while the agent is still working. One rule protects the reader from the
    motion: an arriving file is appended and never moves the focused pane's
    selection.
15. **An empty change set is a sentence, not an empty window.** A thread that
    has changed nothing says so and offers nothing to navigate.

## Keys in DIFF mode

| Key | Meaning |
| --- | --- |
| `j` `k` | move within the focused pane — file, or hunk |
| `tab` `h` `l` | switch pane |
| `gg` `G` | first, last |
| `n` `N` | next, previous hunk, across files |
| `/` | filter the file list |
| `y` | copy the focused hunk |
| `esc` | close, returning to the mode that opened it |

## What pi gives us

Established during the grill, so the design does not have to guess:

- pi emits `tool_execution_start` and `tool_execution_end`. The translator
  already turns both into `tool-start` and `tool-end`, and already tracks
  in-flight calls in `#open` so an abort can close a row that would otherwise
  pulse forever.
- There is nothing between those two events. No progress, no percentage, no
  partial result. A row's life is binary: running, then a status.
- `ToolStatus` is `running | ok | fail | cancelled | denied | plain`. Everything
  a label needs is already in the model.
- `Ledger.svelte:73` prints `row.kind` verbatim in every state. The lifecycle is
  in the data and not on the screen.

## In scope

- A diff body for `edit` and `write` rows, built in the main process.
- The wording of a tool row across its life, for every kind, not only edits.
- The cap, and what a capped row says about what it is hiding.
- A floating diff viewer: file list, change pane, keys, performance.
- How the viewer scopes what it shows.

## Out of scope

- Editing a file by hand in either surface. Both are review surfaces.
- Merge-conflict resolution.
- Diffs between arbitrary revisions. That is a git browser.
- Word-level intra-line diffing in the first slice.
- Staging or reverting a hunk. Decided against for now: it makes the app own a
  git index that the commit card would then have to agree with.

## Acceptance behavior

- An `edit` row arrives open, showing its own change, coloured as the reference
  colours it.
- A `write` row shows the file it created, entirely as additions.
- A row larger than the cap says how much it is hiding, and offers the viewer.
- `a` on such a row opens the viewer at that file.
- The viewer opens on its hotkey from anywhere a thread is focused.
- The viewer lists each changed file once, with its net line counts.
- A row reads `reading` while its call runs and `read` when it lands, and the
  same for every other kind.
- No target moves sideways when a call lands.
- A denied or cancelled call does not read as though it completed.
- In the viewer, the file list and the change pane both take vim keys, and the
  mode indicator says which surface owns them.
- A thread with a thousand changed lines does not drop a frame, on the budget in
  `docs/quality.md`.
- Nothing is committed that the reader had no way to see.

## Constraints

- Git access lives in `src/main/git/`. The renderer never runs git.
- The diff crosses `src/shared/protocol.ts` as data, never as rendered markup.
- `ToolBody.svelte` already renders `{ type: 'diff' }`. Extend that path; do not
  add a second diff renderer for the same rows.
- Reuse the block registry, the ring, and READ. A second focus model is the
  failure this project has already paid for twice.
- Colouring reuses `highlight.ts`, which already has a `diff` grammar.
- The viewer floats. Paint containment on the column clips overlays; the block
  menu has been fixed for this twice, so the viewer must not be a child of it.

## Validation

- Translator tests: an `edit` and a `write` produce the diff a fixture expects,
  including a file with no trailing newline and a pure deletion.
- A cap test: an edit larger than the cap reports what it hid.
- A perf pass on a thread of large edits, measured as `docs/quality.md` requires.
- A CDP pass: the row paints, the viewer opens, the keys move the right pane.

## Risks

- **The gutter measurement is a layout read on a list that can hold thousands of
  rows.** The transcript's perf work has already shown that reading a rect on a
  `content-visibility: auto` element forces its layout. The measurement must be
  CSS, not JavaScript, or it undoes that work.
- **The viewer floats over a column that has paint containment.** The block menu
  has been clipped by this twice. The viewer must not be a child of the column.
- **Snapshots hold file contents in memory for the life of a thread.** A thread
  that edits a large file fifty times must not grow without bound; only the
  first and last snapshot of each file are needed once a call has ended.
- **A file the agent edits outside the tool** — through `bash`, say — produces a
  snapshot pair that attributes someone else's change to the agent.

## Settled by omission

These were open and are now closed by the decisions above, recorded so a later
reader does not reopen them:

1. The hotkey, and whether it is modal or a chord. → decision 12.
2. The cap, and what the hidden remainder says. → decision 13.
3. Whether the viewer follows live. → decision 14.
4. Whether the file list is a spotlight or a pane. → decision 11, a pane.
5. What the viewer does with no changes. → decision 15.

Nothing is open. The spec is ready for approval, not yet approved.
