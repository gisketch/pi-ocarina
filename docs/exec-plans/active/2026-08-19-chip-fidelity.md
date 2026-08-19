# Chip fidelity — tickets

Reported 2026-08-19, from live use. No spec of its own: each item amends
behavior settled in [2026-08-17-paste-and-media.md](../../specs/2026-08-17-paste-and-media.md)
and its plan [2026-08-18-paste-and-media.md](2026-08-18-paste-and-media.md).
Amendments recorded per ticket. TDD: each slice starts from a failing unit
test in the named `*.test.ts`.

Status legend: `todo` · `in-progress` · `done`.

## C1 — the composer stops injecting whitespace, and every mark is one size — `done`

> Amends the settled decision that a chip's mark buys itself cells by inserting
> spaces. The reader owns their spacing; the mark adapts, not the text.

- `src/renderer/src/lib/slash.ts` — `applySlash` drops the leading `pad`
  space. The trailing space also goes: what the reader types after a chip is
  theirs, even when it breaks the name's match.
- `src/renderer/src/lib/mention.ts` — same treatment for `applyMention` if it
  pads.
- `src/renderer/src/lib/composer-segments.ts` — `fileSpans` stops claiming
  preceding spaces (`lead: 0` unless the text itself gives a sigil);
  `segment()` for skills claims only the `/` cell.
- `src/renderer/src/components/composer/Mirror.svelte` — `.lead::before` gets
  a fixed `mask-size` instead of `contain`, so a mark at position 0 and a mark
  mid-sentence render at the same size. Pick one size that fits the narrowest
  real cell; equal-and-small beats sometimes-large.
- Acceptance: inserting a skill from the menu at position 0 adds no space
  before or after; the text is exactly what the reader typed plus the name;
  the mark on `/skill-creator` at position 0 and after a word measure the
  same; a staged file's chip never swallows spaces the reader typed.
- Validation: failing tests first in `slash.test.ts` (`applySlash` output has
  no pad), `composer-segments.test.ts` (file span equals the name, skill lead
  equals 1); a browser pass measuring the mark at both positions.
- As built: `contain` stayed — every lead is exactly one cell now, which is
  what makes `contain` yield one size. A file chip still claims one typed
  space when there is one; with none it draws markless. Menus no longer rely
  on a trailing space to stay closed: `completions` remembers the completed
  token (`start` + `query`) and suppresses reopening on exactly it.

## C2 — a chip deletes as one thing — `done`

> A chip is one entity. Any edit that wounds it removes it whole.

- `src/renderer/src/lib/composer-delete.ts` (new) — pure
  `chipDelete(text, selStart, selEnd, key, spans)`: for `backspace`, `delete`,
  or `cut` whose affected range intersects any chip span from `segment()`,
  the range expands to cover every intersected span whole; returns
  `{ text, caret, removed }` with the spans that went, or `null` when no chip
  is touched. Covers: caret inside the chip, caret at either edge, a
  selection covering part of one, a selection crossing several.
- `src/renderer/src/components/Composer.svelte` — the `onkeydown` ladder at
  `Composer.svelte:184` routes through `chipDelete` first; `removed` spans of
  kind `fold` drop the fold, kind `file` unstages the attachment — the paths
  `pasting.backspace()`, `attachments.backspace()`, and `skillBackspace()`
  already walk, now for every wound, not only caret-at-end.
- `src/renderer/src/lib/slash.ts` — `skillBackspace` folds into the general
  path or delegates to it; no second rule to drift.
- Acceptance: select the `k` inside the `skill-creator` chip and press
  `backspace` — the whole chip goes, and its staged state with it; `delete`
  with the caret before a chip removes the whole chip; a selection spanning
  plain text plus half a chip removes the plain text and the whole chip;
  edits that touch no chip behave exactly as before.
- Validation: failing tests first in `composer-delete.test.ts` — every case
  above, for skill, file, and fold chips, plus the no-chip passthrough.
- Blocked by: C1 (span shapes settle there first).
- As built: `chipDelete` returns `{ text, caret }`; staged state is dropped by
  the existing `prune(text)` scans, so there is no second bookkeeping channel.
  `cut` widens the selection to whole chips before the browser cuts, so the
  clipboard carries the whole chip. The three per-kind backspace helpers
  (`pasting.backspace`, `attachments.backspace`, `skillBackspace`) are gone.
  Mentions stay character-editable on purpose: a shorter path is still a path.

## C3 — the transcript draws a named skill as a chip — `done`

> The sent message shows a `<skill name=… location=…>…</skill>` wall where the
> composer showed one chip. Same thing, same drawing, both sides of send.

- `src/renderer/src/lib/skill-chips.ts` (new) — pure marker over the raw user
  message text, before markdown: finds `<skill name="X" location="…">…</skill>`
  blocks and bare `/skill:X` tokens, replaces each with one inline skill
  segment carrying the name. Runs only on `role: 'user'` text.
- `src/renderer/src/components/thread/Message.svelte` — feeds user text
  through the marker beside `markNodes` at `Message.svelte:47`.
- `src/renderer/src/components/thread/md/Inline.svelte` — a `skill` branch
  beside the attachment branch at `Inline.svelte:20`: `tool-skill` icon, the
  composer's skill colors (`--warn` ink, the same tinted background), the
  bare name as text.
- Acceptance: a sent message whose text carries the expanded `<skill>` block
  renders one chip reading `sonata-grill`, and none of the block's body; the
  surrounding sentence is untouched; agent messages never match.
- Validation: failing tests first in `skill-chips.test.ts` — a block mid
  sentence, a block spanning many lines, `/skill:name`, a `<skill>` string
  inside a code fence stays literal, agent text passes through.

## C4 — one file, one icon, everywhere — `done`

> The picker already knows a `.md` from a `.png`. Chips ask it instead of
> guessing.

- `src/renderer/src/components/thread/md/Inline.svelte` — the attachment
  chip's `isPicture ? 'image' : 'file'` at `Inline.svelte:24` becomes
  `fileIcon(part.text)` from `icons.ts:273`.
- `src/renderer/src/components/thread/UnnamedChips.svelte` — same swap.
- `src/renderer/src/components/composer/Mirror.svelte` — `MARKS` stops being
  three fixed masks: file and mention chips mask through
  `fileIcon(name)` per chip, so `CLAUDE.md` wears the markdown mark and
  `pasted-1.png` the image mark, in the composer as in the picker.
- Acceptance: `CLAUDE.md` shows the markdown icon and `pasted-1.png` the
  image icon, identically in the picker, the composer, and the sent message.
- Validation: failing tests first — extract the per-chip icon choice into a
  pure helper if the component inline makes it untestable; cases for `.md`,
  `.png`, an unknown extension, a lockfile name.

## Order

C1 → C2. C3 and C4 run free, any time, in parallel with either.

## Second report, 2026-08-19: the mirror cannot draw the chip the reader wants

Live use after C1–C4: marks still tiny and uneven, no gap between icon and
name, the space before a pasted name visually absorbed into its chip, and a
chip at position 0 markless. All four are one fact: in a textarea+mirror, an
icon must stand on a text cell, and a gap must *be* a character. There is no
cell to stand on unless the text donates one.

Decision (user): chips become real inline elements — one reusable component,
icon + label + padding, used by the composer and the transcript alike. The
composer leaves `<textarea>` for a `contenteditable` field where a chip is an
atomic non-editable element. This supersedes the paste-and-media spec's
"chips are drawn over the textarea, never inside it": the constraint it
protected (caret fidelity) is carried by DOM-truth serialization instead.
Known cost: native undo of programmatic edits is weaker than a textarea's.

## D1 — one chip component, adopted by the transcript — `done`

- `src/renderer/src/components/Chip.svelte` (new) — icon + label, padded,
  inline; tones `accent` (files), `warn` (skills), `dim` (folds); a button
  when given `onclick`. Styles in `global.css` as `.inline-chip`, shared with
  the composer's DOM-built chips.
- `Inline.svelte`, `UnnamedChips.svelte` — render through it.
- Acceptance: chat chips show `{icon} {name}` with visible gap and padding.
- Validation: existing chat tests; visual pass.

## D2 — the editor's text model — `done`

- `src/renderer/src/lib/chip-field.ts` (new) — pure DOM helpers: `chipNode`
  (build a chip element carrying `data-token`), `serialize` (DOM → the exact
  composer string: text nodes as text, chips as their tokens, `<br>` as a
  newline with a lone/trailing one dropped), `caretOffset` / `setCaret`
  (selection ↔ serialized index, chips atomic).
- Validation: TDD under happy-dom — round-trips, chips at edges, newlines,
  caret on both sides of a chip, index inside a token clamps past the chip.

## D3 — the composer becomes a chip field — `done`

- `src/renderer/src/components/composer/ChipField.svelte` (new) — replaces
  `Field.svelte` + `Mirror.svelte`. Contenteditable, `field-metrics` kept;
  renders `segment()` output as text nodes + chip elements on programmatic
  value changes only (typing never rebuilds, so IME stays native). Exposes a
  `CaretField` handle (`value`, `selectionStart/End`, `setSelectionRange`,
  `focus`) so `completions`, `pasting`, and `nameAt` keep their shape.
- `Composer.svelte` — paste always prevented, plain text inserted through the
  model; `chipDelete`/`oncut`/`resizeField` removed — a
  `contenteditable="false"` chip is natively atomic.
- `composer-segments.ts` — a file chip claims no space at all any more; the
  space before a name stays visible text.
- Acceptance: uniform icons with a gap in every chip anywhere in the line;
  `This is {chip}` keeps its space; chip at position 0 has an icon;
  wounding deletes stay whole-chip; menus, folds, drafts, send unchanged.
- Validation: D2 tests; full suite; live pass — insert, type around, delete,
  paste image at position 0, send.
- Blocked by: D1, D2.

### As built (D1–D3)

- The `CaretField` interface (`chip-field.ts`) is the composer's field
  contract now; `pasting`, `nameAt`, and `completions` speak it, and a real
  textarea still satisfies it structurally.
- Shift+enter writes the newline by hand (the browser's Enter would wrap
  lines in elements the model does not speak); every paste is prevented and
  goes through the model, plain text included. Native undo of programmatic
  edits is weaker than the textarea's was — accepted with the architecture.
- Chips are chipped on programmatic value changes only. A token typed out by
  hand stays visible text until the next programmatic render; `skillsSaid`
  still converts it on send, so meaning is unchanged.
- `composer-delete.ts` (C2) lived for one day: `contenteditable="false"`
  makes the browser delete a chip whole, so the rule dissolved into the
  platform. `Mirror.svelte`, `Field.svelte`, and the per-kind backspace
  helpers are gone with it.
