# Change review: read what the agent wrote

Status: **NEED GRILLING.** High-level. Not an approved contract.

Ranked first in the landscape read
([docs/reference/2026-08-16-agent-harness-landscape.html](../reference/2026-08-16-agent-harness-landscape.html)).

## Problem

PiOcarina shows that files changed. It never shows the change. The commit card
reads `--numstat` and `--name-status`, so a reader learns that `app.ts` gained
12 lines and lost 3, and then has to leave the app to find out what those lines
are. Every comparable tool closes this loop inside itself.

The loop today ends one step early: the agent writes, and the reader commits
something they have not read.

## Desired outcome

A reader stays in the column. They walk the change the same way they walk the
transcript — the ring moves through hunks, `a` acts on the one under it — and
they commit knowing what they are committing.

## In scope

- Rendering a diff: files, hunks, added and removed lines.
- The diff as navigable blocks, inside the existing READ mode.
- Acting on one hunk: at minimum revert; stage if the grill wants an index.
- Where a diff comes from: the working tree, and a single turn's edits.

## Out of scope

- Editing a file by hand inside the diff. This is a review surface.
- Merge-conflict resolution.
- Diffs between arbitrary revisions. That is a git browser, not this.
- Syntax-aware or word-level intra-line diffing in the first slice.

## Acceptance behavior

- A reader opens the change for the focused thread and sees every changed file.
- `j` and `k` move the ring by hunk, not by line.
- The mode indicator is READ. `esc` returns to the strip, as everywhere else.
- `a` on a hunk offers the actions the grill settles on.
- A file with 2,000 changed lines opens without dropping a frame, on the same
  budget the transcript holds (see `docs/quality.md`).
- Nothing is committed that the reader has not been able to see.

## Constraints

- Git access lives in `src/main/git/`. The renderer never runs git.
- Diff text crosses at `src/shared/protocol.ts` as data, not as rendered HTML.
- Reuse the block registry and ring. A second focus model in the same app is
  the failure this project has already paid for twice.
- Colouring reuses `highlight.ts`. The diff grammar already exists there.

## Validation

- Parser tests against real `git diff` output, including renames, binary files,
  a file with no trailing newline, and an empty diff.
- A perf pass on a large diff, measured the way `docs/quality.md` requires.
- A CDP pass in the running app: the ring lands on a hunk and the paint is right.

## Questions the grill must answer

1. Where does the diff live: a fourth column kind, an overlay, or blocks inside
   the thread it belongs to?
2. Which diff does a reader want by default — the whole working tree, or the
   edits of one turn? A turn's edits need the driver to record them.
3. Unified or split? Split doubles the width in a column layout built on density.
4. Does `a` stage, revert, or both? Staging implies the app owns an index the
   commit card must then agree with.
5. Does the diff update live while the agent is still editing, or on demand?
6. What happens to the ring when the underlying file changes beneath it?
