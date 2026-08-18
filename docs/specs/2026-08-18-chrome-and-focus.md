# Chrome that says less, and focus that shows more

Status: **NEED GRILLING.** High-level. Not an approved contract.

Amends two approved specs. [2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md)
owns the status bar and the dim; [2026-08-18-chat-polish.md](2026-08-18-chat-polish.md)
added the follow indicator this removes. Neither is rewritten — this records
what replaces those decisions and why.

## Problem

**The status bar says things nobody reads.** `thread 1/3` is a position the
strip already draws, and the reader is looking at the strip. `paused` and
`FOLLOWING` describe a state the transcript itself makes obvious: if the view
is not moving while content arrives, the reader knows, and the jump pill
already appears when it matters. Both take width from the segments that do
carry information — the workspace, the branch, the permission level, the
language servers, the context meter.

**A column header does not say which model is answering.** The model is the
one fact about a thread that changes what its answers are worth, and it lives
in the app's title bar for the focused thread only. A strip of four columns
running three different models says so nowhere.

**Focus is drawn by taking contrast away from everything else.** Pointing at a
block greys the entire rest of the thread — a whole column of text goes
unreadable to mark one paragraph. It is a heavy way to say "here", it makes
the surrounding context harder to use at exactly the moment the reader is
navigating through it, and it fights every other tone in the app.

## Desired outcome

The status bar carries only what the reader cannot see elsewhere. Each column
header names its thread and the model answering in it. And the focused block
is marked by lighting *it* — a full-bleed band behind the block, the way a
line-wise visual selection reads in vim — rather than by dimming the thread
around it.

## In scope

- Removing the thread-position and follow-state segments from the status bar.
- Adding the model to the column header, beside the title.
- Replacing the dim-everything-else focus treatment with a highlight on the
  focused block.
- What that highlight looks like for a block that is a single row, a message,
  a card, and a group.

## Out of scope

- The strip's own layout, which already shows position.
- Changing which blocks are focusable, or any keybinding.
- The jump pill, which stays — it is an action, not an indicator.
- The status bar's remaining segments.

## Acceptance behavior

- The status bar shows no thread position and no follow state; nothing else
  it showed is lost.
- Each column header shows the thread's title and the model answering in it.
  A thread that has not said anything yet still shows the model it will use.
- A header too narrow for both keeps the title readable; the model gives way
  first.
- Focusing a block draws a band behind it that runs the full width of the
  column, with no gap at either edge.
- Nothing else in the thread changes appearance when a block is focused: no
  grey, no fade, no filter.
- The band reads clearly in both themes and never makes the text on it harder
  to read than unfocused text.
- Moving focus moves the band; releasing focus removes it.

## Constraints

- A full-bleed band inside a padded column means the highlight cannot be a
  background on the block's own box, which is inset. Whatever draws it must
  not change any block's layout — a highlight that reflows the transcript
  while `j` walks it is worse than the dim it replaces.
- The transcript is virtualized and blocks carry paint containment; a band
  drawn outside a block's own box has to survive that.
- One highlight, every block kind. Four surfaces that each drew their own
  would drift.

## Validation

- A browser pass over `j`/`k` through a thread containing a message, a ledger
  row, a group, and a card: the band lands on each, full width, and nothing
  else changes.
- Screenshots in both themes.
- A check that the removed status-bar segments are gone and the rest are
  unmoved.

## Questions the grill must answer

1. What the band is made of: a background on a full-width wrapper, an
   absolutely-positioned element behind the block, or a box-shadow spread to
   the column's edges?
2. Its colour — a step up from the column's ground, or a wash of the accent?
   Does the focused block's text change at all?
3. Does the band cover a block's own children (a ledger row's expanded body, a
   group's members), or only the row itself?
4. Where the model sits in the header, and what it shows when the thread is
   running a model the reader did not choose.
5. Does anything replace `thread 1/3` for a reader whose strip is scrolled?
