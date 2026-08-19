# Paging carries the ring in READ

Owner decision, 2026-08-18. Amends the `ctrl-d` / `ctrl-u` behaviour settled
earlier the same day, which made the chord a scroll and nothing else in every
mode.

## Problem

In READ the chord moves the view and leaves the ring behind. A reader on the
newest block who pages up three screens is still pointing at the newest block,
which is now three screens below the fold — so `j` and `k` resume from
somewhere they cannot see, and the first press drags the view back down.

The earlier version of this carried the ring but revealed it with `'start'`
after scrolling, so two scrolls fought over the same element. That is the
mistake this must not repeat.

## Outcome

In READ, the chord moves the view and the ring travels with it, landing on a
block the reader can see. The ring never causes a scroll of its own.

## In scope

READ only. From NORMAL the chord stays a scroll and nothing else: a reader
skimming has not asked to point at anything, and lighting one block is a mode
change they did not ask for. That decision stands.

## Behaviour

1. The ring lands on the **topmost block on screen** — the first whose head is
   at or below the top of the view once the scroll has travelled. Where a block
   is taller than the column and no head is visible, it lands on the block
   covering the top edge, which is the block the reader was already inside.
2. The landing is decided **immediately**, from the distance the scroll is
   about to travel, not from the layout after it lands. The band moves in the
   same frame as the keypress. The distance used is the one the scroll will
   actually cover after clamping, not the nominal half-column.
3. **The ring is set, never revealed.** Nothing about the landing may move the
   view. `blockFocus.set` and not `move`.
4. At the ends of a thread, where the view cannot travel, the ring goes to the
   **last block** on `ctrl-d` and the **first** on `ctrl-u` — the convention
   every editor already taught. The chord always advances the reader in the
   direction they pressed.

## Accepted risk

A block measured for the first time mid-scroll can shift the layout enough that
the predicted block is not the one that ends up topmost. The error is one block,
and nothing scrolls because of it, so the cost is the band sitting on the second
block rather than the first. Correcting it after the scroll settles was
considered and rejected: the band moving twice for one keypress reads as a fault
even when it is right.

## Acceptance

- In READ, at the bottom of a long thread, `ctrl-u` three times leaves the ring
  on a block that is on screen, and the view where the third press put it.
- `j` immediately after paging moves one block from what is lit, and does not
  drag the view back to where the ring used to be.
- `ctrl-d` at the bottom of a thread lights the newest block and does not move
  the view.
- From NORMAL, neither chord lights anything.

## Validation

The frame-driven paging test already in `block-paging.test.ts` extends to the
ring: drive the real key path, grow a block mid-scroll, and assert both the
travel and which block ends up lit.

Tickets in
[2026-08-18-read-paging.md](../exec-plans/active/2026-08-18-read-paging.md).
