# Modes and the ledger gutter (shell amendment)

Status: **approved 2026-08-16.** Amends
[2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md), which is a
finished milestone-1 contract and stays frozen; where the two disagree, this file
wins. It also amends the ledger's fixed gutter in
[2026-08-15-thread-ledger.md](2026-08-15-thread-ledger.md).

## Why this exists

The frozen spec names three modes: NORMAL, INSERT, LEADER. The app has five. TERM
arrived with the terminal column and READ with block navigation, and neither
amended the contract that says how many modes there are. A frozen spec that
quietly disagrees with the app teaches a later reader the wrong thing, and that
reader is usually an agent.

[2026-08-16-change-review.md](2026-08-16-change-review.md) adds a sixth. Rather
than write a third undocumented mode, this file restates the mode set as it
stands and takes the deviation the change-review grill settled.

## The mode set

`NORMAL | READ | INSERT | LEADER | TERM | DIFF`

- **NORMAL** — the strip. Unchanged.
- **INSERT** — the composer owns the caret. Unchanged.
- **LEADER** — transient, 2.6s. Unchanged.
- **READ** — the reader is inside one column's transcript. `j`/`k` move the block
  ring rather than scrolling; `h`/`l` expand and collapse rather than moving
  between columns; `esc` returns to NORMAL. Shipped in H1–H4.
- **TERM** — the pty owns every key. Shipped in E3.
- **DIFF** — the change viewer owns every key. New; see below.

Every mode is the single arbiter of who receives a key, which is the frozen
spec's own risk note and still the rule.

## What DIFF adds

- `d` in NORMAL and in READ opens the change viewer and enters DIFF. `␣ d` is the
  same action, so the which-key bar can teach it.
- `esc` closes the viewer and returns to the mode that opened it.
- Inside DIFF: `j`/`k` move within the focused pane, `tab`/`h`/`l` switch pane,
  `gg`/`G` jump to the ends, `n`/`N` step hunks across files, `/` filters the file
  list, `y` copies the focused hunk.
- The statusbar shows DIFF and colours it, as it already colours READ.

`d` was free: the reducer's letter bindings are `a c f h i j k l m n s t w x y`.

## What the ledger gives up

The frozen ledger spec fixes the kind label to a 36px gutter, which aligns every
row's target because `read`, `grep`, `edit` and `bash` are all four letters.

A row now states its tense — `reading` while the call runs, `read` when it lands.
Those words do not fit. So **36px becomes a minimum rather than a fixed width**,
with two constraints that make the change safe:

1. The measurement is shared across a ledger, not taken per row, or targets stop
   aligning with each other.
2. The measurement is of the widest label the ledger *could* show, not the widest
   it shows now. Sizing to current text would shift every target sideways each
   time a call landed.

It must be a CSS measurement. Reading a rect in JavaScript over a list of this
size forces layout on `content-visibility: auto` elements, which is a cost the
transcript's perf work has already measured and removed once.

## Validation

- Reducer tests for `d` from NORMAL, from READ, and as a leader chord.
- A test that DIFF owns keys the other modes bind, `j` and `a` among them.
- A CDP pass: no target moves sideways when a running row lands.

## Risks

- Six modes is near the limit of what a mode chip can teach. A seventh needs a
  better answer than a seventh chip.
- `d` is one keystroke from `s` and `a` on the home row. If it proves easy to hit
  by accident while reading, a leader-only binding is the fallback.
