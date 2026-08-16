# Change review: read what the agent wrote

Status: **NEED GRILLING.** High-level. Not an approved contract.

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

## In scope

- A diff body for `edit` and `write` rows, built in the main process.
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

## Questions the grill must answer

1. What the viewer scopes to: the focused turn, the whole thread, or every
   change since the thread started.
2. The hotkey, and whether it is modal or a chord.
3. The cap: how many lines, and what the hidden remainder says.
4. Whether the viewer follows the agent live while it edits, or freezes on open.
5. Whether the file list is a spotlight (which exists) or its own pane.
6. What the viewer does for a thread with no changes.
