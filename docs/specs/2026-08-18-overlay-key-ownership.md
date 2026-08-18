# A screen owns the keys it is drawn over (shell amendment)

Status: **approved 2026-08-18.** Amends
[2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md), which is a
finished milestone-1 contract and stays frozen; where the two disagree, this
file wins.

## Why this exists

The frozen spec grants one exception to modal ownership:

> `1–3` (and future `4+`) jump to that pinned workspace. Also honored while an
> overlay is open (closing it first).

and repeats it:

> Typing in INSERT (or palette input) must never trigger NORMAL bindings except
> the `1–3`-with-overlay rule above and `esc`/`⌘K`.

It was written as an escape hatch: a way out of a screen without reaching for
`esc`. In use it is the opposite. A reader filtering the workspace switcher
types `2` and the strip behind them changes workspace and the dialog vanishes.
A reader on the settings screen presses `j` to move its highlight and the
column behind them enters READ — a mode with a ring and a dim, both invisible
under the dialog, and both still there when it closes.

The escape hatch was also never the only leak. Two lists decided who got a key,
and only one of them knew a dialog was open:

- The reducer had a set of overlays that "own a caret". A screen not in that
  set — settings, keymap — fell through to every NORMAL binding, so `t` opened
  a terminal and `H` moved a column nobody could see.
- The shell asked the column's own surfaces — the block menu, the leap hints, a
  pending question, the agent peek — before it looked at the overlay at all. A
  digit pressed under the settings screen could answer a question the reader
  could not read.

## The rule

**While anything is drawn over the strip, no key reaches the strip.** One
sentence, and it holds in both places: the key reducer, and the routing that
picks which surface answers first.

- No digit changes workspace from any overlay, in any mode.
- No transcript key — `j` `k` `h` `l` `G` `t` `o` `a` `s` `y` `i` `␣`,
  `ctrl-d`/`ctrl-u` — acts under an overlay.
- No column surface is asked for a key while an overlay is open.
- `esc` and `⌘K` still work from everywhere. `esc` closes the nearest thing
  first, exactly as before.
- One key still acts while a screen is open, and it acts on the screen rather
  than under it: the key that opens a screen closes it, and another screen's
  key swaps to that screen. `,` closes settings, `m` swaps to the model picker,
  `?` closes the keymap. These never touch a column, so they are not a leak.
- Overlays that own a caret are unchanged in every other way: their input still
  receives every keystroke, now including digits.

The leader chord is unaffected: `␣ 1` still jumps workspaces, because a chord
starts from the strip and there is no dialog over it.

## What this costs

The escape hatch is gone. Leaving a screen is `esc`, then the digit — one more
keystroke, in exchange for a strip that never moves behind a dialog. `esc` is
already the way out of every other modal in the app, so the reader is not
learning a new key.

The keymap screen has no keys of its own yet, so `j` and `k` do nothing there
rather than scrolling it. That is a gap in the keymap screen, not a reason to
let it scroll the transcript behind it.

## Validation

- `keyboard-overlays.test.ts` — the reducer half: digits and the transcript
  keys under each kind of screen, and the toggle keys that still act.
- `shell-overlay-keys.test.ts` — the routing half: the column surfaces are
  asked only while nothing is drawn over them.
- Browser pass against the dev harness: settings open, `j` moves its highlight
  and the mode chip stays NORMAL; `2` leaves both the workspace and the dialog
  alone.
