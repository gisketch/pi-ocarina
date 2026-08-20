# Pane Reveal and EDITOR — Execution Plan

Status: drafted 2026-08-20. Canonical behavior lives in
[the approved spec](../../specs/2026-08-20-pane-reveal-and-editor.md).

Two independent tracks share this plan: the pane-group width regimes (PR),
and the buffer column's rename plus its markdown reading view (ED). PR and ED
never touch the same files; they can be worked in parallel. Per house rule,
each ticket runs one small targeted validation and ends in its own scoped
commit.

## PR1 — Fixed widths and the REVEAL clamp

Delivered behavior: an attached group never resizes and never overlaps. From
`820px` up, both members keep their constant widths (`780 + 390`); when the
viewport is narrower than the `1170px` group, the strip offset is clamped so
the focused member is fully visible and the partner is clipped by the
viewport edge. A focus change inside the group slides the strip with the
existing transform transition.

Low-level notes:

- `src/renderer/src/lib/strip.ts` grows the regime constants
  (`REVEAL_MIN_WIDTH = 820`, existing `ATTACHED_GROUP_WIDTH = 1170`), a
  `paneRegime(attached, viewportWidth): 'full' | 'reveal' | 'split'`
  selector, and a pure clamp: given the member boxes inside the group, the
  group's centered offset, the focused member, and the viewport width,
  return the offset that keeps the focused member's box inside the viewport
  (no-op when centering already satisfies it).
- `paneGroupWidth` stops shrinking: attached is always `1170` outside SPLIT.
  `paneGroupIsNarrow` and the `960` constant retire with the display-none
  fallback.
- `PaneGroup.svelte` drops the `narrow` class and its
  `display: none` / `width: 100%` rules; members are fixed `780px` and
  `390px` (the `2:1` percentages become the same numbers on a constant
  group).
- `Strip.svelte`'s `offsetOf` applies the clamp when the focused entity is
  an attached group in REVEAL.

Acceptance criteria:

- At every viewport from `820px` to `2000px`, host and attachment widths are
  constant; no width shows one drawn over the other.
- Viewport `1000px`, host focused: host fully visible, attachment clipped.
  Focus the attachment: the strip slides, attachment fully visible, host
  clipped on its far side. Left-side and right-side attachments both work.
- Viewport ≥ `1170px`: behavior identical to today's FULL centering.
- A plain unattached column is untouched at every width.
- No xterm resize fires on focus changes or viewport changes within REVEAL
  (widths never changed).

Validation: targeted `src/renderer/src/lib/strip.test.ts` — regime selection
at 819/820/1169/1170, clamp for host-focused, attachment-focused, both
sides, and the centered no-op.

Blocked by: nothing.

## PR2 — SPLIT: the group dissolves below 820px

Delivered behavior: below `820px` of viewport the host and its terminal are
laid out and centered as two ordinary strip columns with the normal gap,
each fully visible when focused. The attachment model is untouched — close
semantics, magnetism, persistence, and the process all survive; growing the
window re-forms the zero-gap group with no remount and no scrollback loss.

Low-level notes:

- In SPLIT, `Strip.svelte` treats each member as its own entity for
  `stripGroupOffset`: the widths array carries `780` and `390` as separate
  entries (in side order) and the focused index addresses the member, not
  the host.
- `PaneGroup.svelte` in SPLIT renders its members with the strip gap between
  them (a `gap` on the group is enough — the DOM stays identical so xterm
  and CodeMirror never remount across regime changes).
- The terminal keeps `390px` in SPLIT — no width change, no re-wrap.

Acceptance criteria:

- Viewport `700px`: `h`/`l` walks chat and terminal as two entities, each
  centered alone when focused, gap visible between them.
- Closing the chat still closes the terminal with the one attached-host
  dialog; `Shift-H`/`Shift-L` magnetism unchanged.
- Resize sweep `700 → 1000 → 1400 → 700` never remounts either member:
  terminal scrollback and vim state survive, no fresh pty.
- Restart in SPLIT restores the attachment exactly as before.

Validation: targeted strip geometry tests — SPLIT widths array, per-member
centering, boundary hand-off at 819/820.

Blocked by: PR1.

## ED1 — The reader's word is EDITOR

Delivered behavior: every reader-facing `BUFFER` becomes `EDITOR`.

Low-level notes: `FileColumn.svelte` header kind, `KeybindsOverlay.svelte`
group label (`buffer: 'BUFFER'` → `'EDITOR'`; the config key and mode names
stay), `BufferSettingsOverlay.svelte` title, heading, and prose, plus a
docs sweep (`AGENTS.md` and any doc describing the surface in present
tense). Internal identifiers (`buffers` store, `FileColumn`, column ids,
saved keybind configs) do not change.

Acceptance criteria:

- Column header says `EDITOR`; keymaps screen group says `EDITOR`; settings
  overlay says `EDITOR SETTINGS`.
- `rg -i buffer` over reader-facing template strings finds nothing left;
  saved keybind config files load unchanged.

Validation: `pnpm check` (string-only change; existing keymap tests cover
the config compatibility).

Blocked by: nothing.

## ED2 — Markdown reads rendered

Delivered behavior: a markdown file opens as rendered markdown in the chat's
typography; entering vim shows the raw source; Escape back to OCARINA shows
the rendered view again, current with unsaved edits; re-entering vim lands
on the preserved cursor with undo intact. Non-markdown files are unchanged.

Low-level notes:

- New component `src/renderer/src/components/strip/EditorRendered.svelte`
  (own file — the 350-line ceiling on `FileColumn` holds): parses the
  current text through `parseMarkdownCached` and draws it with the existing
  `md/` node components; wheel/trackpad scrolling; chat-body typography.
- `FileColumn.svelte` decides by extension (`.md`, `.markdown`, `.mdx`) and
  by mode: rendered while the app mode is not a vim mode, source otherwise.
  The CodeMirror host is hidden (`display: none`), never destroyed — the
  handle, cursor, undo history, and dirty state persist across swaps.
- The swap-back reads the live text from the editor handle (dirty edits
  included); watcher reloads (`buffers.changed`) re-render through the same
  path.
- File chips come free from the `md/` components (spec D9 detection rides
  the shared markdown pipeline); verify, don't rebuild.
- Hints row on a markdown editor names the swap (`⏎ edit source`).

Acceptance criteria:

- `README.md` opens rendered: headings, highlighted fences, lists, in chat
  typography. `main.ts` opens as the raw editor with no rendered flash.
- `Enter` swaps to source at the preserved cursor; type an edit, Escape:
  rendered view shows the edit; `Enter` again: cursor where it was, undo
  undoes the edit.
- A clean markdown buffer edited by pi on disk re-renders live; a dirty one
  holds and shows the existing notice.
- A backticked workspace path in the rendered view is a chip and opens its
  column.
- `:w`, `+` dirty mark, staleness refusal all behave exactly as before.

Validation: targeted component/state tests through the existing fake editor
handle — extension gate, mode-driven swap, dirty-text re-render, handle
survival across swaps.

Blocked by: ED1 (same files; keeps the diffs apart).

## ED3 — Paging the rendered view

Delivered behavior: with a markdown editor column focused in OCARINA,
`ctrl-d` / `ctrl-u` page the rendered view by half a viewport, matching the
chat column's paging feel.

Low-level notes: ride the existing half-page seam
(`src/renderer/src/lib/state/paging.ts`) by pointing it at the rendered
view's scroll box when the focused column is a rendered markdown editor; no
new keybinds, no READ ring, no block focus.

Acceptance criteria:

- `ctrl-d` / `ctrl-u` page the rendered view; on a non-markdown editor
  column and in vim modes, behavior is exactly as before.
- The keymaps screen shows no new rows (existing paging binding covers it).

Validation: targeted paging test with a faked scroll box.

Blocked by: ED2.
