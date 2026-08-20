# Pane reveal at narrow widths, and the buffer becomes EDITOR

Status: **approved 2026-08-20 (owner direction).** Tickets in
[2026-08-20-pane-reveal-and-editor.md](../exec-plans/active/2026-08-20-pane-reveal-and-editor.md).

Amends [2026-08-20-attached-panes.md](2026-08-20-attached-panes.md) (the
narrow-window fallback is replaced) and
[2026-08-19-file-search-and-viewer.md](2026-08-19-file-search-and-viewer.md)
(the buffer column's name and its markdown reading view).

## Problem

Two independent polish items on the same pair of surfaces.

**1. The attached pane overlaps its host at smaller widths.** Today the group
resizes: between `960px` and `1170px` of viewport the group width follows the
viewport while the members hold their own widths, so the terminal canvas and
the chat column fight for the same pixels and visibly overlap. Below `960px`
the unfocused member is `display: none` — the partner vanishes entirely
instead of receding.

**2. The buffer column reads like a code editor even for prose.** A markdown
file opens as raw source with line numbers. The app already owns a good
markdown renderer — the chat transcript's — and a reader who opened
`README.md` to *read* it gets worse rendering than the same text pasted into
a chat. The column also says `BUFFER`, a vim word, where the reader-facing
word is `EDITOR`.

## Desired outcome

- Panes never resize and never overlap. The host and its attachment keep
  fixed widths at every viewport size; when both cannot fit, the strip slides
  so the **focused** member is always fully visible and the partner is
  clipped by the viewport edge — still present, still visibly there.
- At very low widths the group stops pretending to be one entity: the
  terminal is laid out and navigated as its own column, centered alone like
  any other, until the window grows back.
- The buffer column is named `EDITOR` everywhere the reader sees it.
- A markdown file opens **rendered**, using the chat's own markdown
  components. Entering vim swaps to the raw source; leaving vim swaps back to
  the rendered view. Non-markdown files are unchanged.

## In scope

- The pane-group layout math and its three width regimes.
- The reader-facing rename `BUFFER` → `EDITOR` (column header, keymaps screen
  group, settings overlay, hints, docs).
- The rendered reading view for markdown files only, reusing the chat
  markdown renderer.

## Out of scope

- Manual resizing of the split (still not resizable, per attached-panes).
- Renaming internal code identifiers (`buffers` store, `FileColumn`, column
  ids) — tickets may rename where the diff stays small, but the contract is
  the reader-facing vocabulary.
- Rendered views for any non-markdown format (no HTML preview, no images).
- WYSIWYG editing of the rendered view — reading only; editing is vim on
  source.

## Settled decisions

### Three width regimes, fixed member widths

Member widths are constants and never change: host `780px`, attachment
`390px`, group `1170px` (zero-gap). The viewport width picks one of three
regimes; the boundaries are exact and owned by pure functions in the strip
geometry module so they are testable without a DOM.

- **FULL** — viewport ≥ `1170px`. The whole group fits: centered as one
  entity, exactly today's wide behavior.
- **REVEAL** — `820px` ≤ viewport < `1170px`. The group keeps its full
  `1170px` width. The strip offset is the centered offset **clamped** so the
  focused member's box lies entirely inside the viewport:
  - Host focused: the host is fully visible; the attachment overflows past
    the viewport edge on its own side and is clipped. Partially visible is
    correct — it shows the terminal is there.
  - Attachment focused: the strip shifts just far enough the other way that
    the terminal is fully visible; the host is clipped on its far side.
  - A `h`/`l` focus change inside the group animates this shift with the
    existing strip transform transition; nothing remounts, nothing resizes,
    so the xterm never re-wraps.
  - Columns without an attachment are untouched: a plain `780px` column
    centers as it always has.
- **SPLIT** — viewport < `820px`. The group dissolves visually: the host and
  the terminal are each their own navigation entity with a gap between them,
  each centered alone when focused, exactly like two ordinary strip columns.
  The attachment **stays attached in the model** — hostId, side, process,
  scrollback, close-together semantics, `Shift-H`/`Shift-L` magnetism, and
  persistence are unchanged; only layout and centering split. Growing the
  window past a boundary restores the regime above with no remount.

The `820px` boundary is `780px` (the host must fit fully) plus a `40px`
breathing margin; below it even the clamped REVEAL would pin the host to
both edges at once. Both boundaries are exported constants, not literals in
components.

### The clamp, precisely

REVEAL's offset is: take the FULL centered offset for the group, then clamp
it so `focused member's left ≥ viewport left` and `focused member's right ≤
viewport right` (the member's box in strip coordinates against the viewport
box). When the centered offset already satisfies both, nothing moves — a
wide-enough viewport in REVEAL looks centered. This is one pure function
taking (member boxes, focused member, viewport width) → offset.

### Rename to EDITOR

`BUFFER` disappears from the reader's view: the column header kind, the
keymaps screen's group label, the settings overlay title and its prose, and
any hint text say `EDITOR`. Docs that describe the surface follow in the
same change (`AGENTS.md`, specs' prose is historical and stays). The vim
mode names inside it (`NORMAL`, `INSERT`, …) are untouched — they are vim's.
Saved keybind configs are unaffected (bindings key on mode names, not on the
group label).

### Markdown reads rendered, edits raw

Only files whose extension is markdown (`.md`, `.markdown`, `.mdx` treated as
markdown text) get a rendered view. The contract:

- **OCARINA (column focused or not, strip owns the keys): rendered.** The
  view is the chat renderer over the buffer's current text — including
  unsaved edits — parsed through the existing cached markdown seam, drawn
  with the existing markdown node components. Same typography as a chat
  message body; the column chrome (header, notice line, hints) is unchanged.
- **Any vim mode (`Enter` → NORMAL, `i` → INSERT, VISUAL, LEAP): raw
  source.** Entering vim swaps the rendered view for the existing CodeMirror
  editor; Escape back to OCARINA swaps back to rendered, re-parsed from the
  live editor text. The editor instance stays mounted and hidden while the
  rendered view shows, so vim state — cursor, undo history, marks, unsaved
  edits — survives every swap and re-entry lands where the cursor was.
- The rendered view scrolls with the wheel/trackpad. `ctrl-d`/`ctrl-u` page
  it from OCARINA while the column is focused, matching the paging feel of a
  chat column. No READ ring, no block focus — it is a document, not a
  transcript.
- Watcher reloads (spec D7 of file-search-and-viewer) re-render: a clean
  markdown buffer that pi edits updates its rendered view live.
- The hints row on a markdown editor names the swap: entering vim is how you
  see and edit the source.
- Non-markdown files never render; they mount straight into CodeMirror as
  today.

File chips inside the rendered markdown resolve exactly as they do in chat
prose (spec D9): a backticked path that exists in the workspace is a chip
and opens its own editor column.

## Acceptance behavior

- With a terminal attached, no viewport width shows the terminal drawn over
  the chat or the chat over the terminal — at every width from `600px` to
  `2000px` the two are edge-to-edge or separated, never overlapping.
- At `1000px` viewport, chat focused: the chat column is fully visible and
  the terminal is partially clipped by the viewport edge. Pressing `l`
  slides the strip; the terminal becomes fully visible and the chat is
  clipped on the left. Neither member changed width; the terminal did not
  re-wrap its lines.
- At `700px` viewport, the terminal sits as its own column with the normal
  strip gap; `h`/`l` walks between chat and terminal as two entities, each
  centered when focused. Closing the chat still closes the terminal with the
  one attached-host dialog.
- Growing the window from `700px` to `1400px` walks SPLIT → REVEAL → FULL
  with no remount, no terminal process restart, and no scrollback loss.
- The column header says `EDITOR`; the keymaps screen group says `EDITOR`;
  the settings overlay says `EDITOR SETTINGS`. The word `BUFFER` appears
  nowhere the reader looks.
- Opening `README.md` shows rendered markdown — headings, fences with
  highlighting, lists — in the chat's typography. `Enter` shows the raw
  source with the vim cursor; typing an edit and pressing Escape back to
  OCARINA shows the rendered view including the unsaved edit; `Enter` again
  returns to the cursor where it was, undo history intact.
- Opening `main.ts` is unchanged: raw editor immediately.
- A dirty markdown buffer's rendered view shows the dirty text, and the `+`
  mark and `:w` staleness contract behave exactly as before.

## Constraints

- Layout regimes are pure functions in the strip geometry module; components
  read them, never re-derive them.
- The rendered view imports the existing markdown parse/render seams
  (`parse-cache`, the `md/` components); it must not fork a second markdown
  pipeline.
- The CodeMirror instance is created once per column and kept mounted across
  swaps — destroying it would lose vim state and violate the re-entry
  behavior above.
- The 350-line ceiling holds; the rendered view is its own component, not
  growth inside `FileColumn`.

## Validation

- Unit tests on the geometry: regime selection at boundary widths (819, 820,
  1169, 1170), the clamp function for host-focused and attachment-focused
  cases including the already-centered no-op, and SPLIT's per-entity widths.
- Editor tests through the existing fake-handle seam: mode swap shows/hides
  the right view, Escape re-renders dirty text, re-entry restores the
  handle's state, non-markdown never swaps.
- `pnpm check` and the owned test files per ticket; the owner does the
  visual pass in the real app (resize sweep with a live terminal, and a
  markdown read/edit round trip).

## Risks

- xterm resize events during regime changes: SPLIT and REVEAL keep the
  terminal at `390px`, so none should fire — a regression here shows as
  scrollback re-wrap and is exactly what the resize-dedupe in
  TerminalColumn guards.
- The hidden-not-destroyed CodeMirror keeps its watchers and memory per open
  markdown column; acceptable at strip scale (columns are few), noted in
  case a future many-columns feature revisits it.
- Rendered-view scroll position and source cursor position are different
  coordinate systems; the spec deliberately does not promise scroll sync
  between them (re-entry restores the *cursor*, not the viewport pairing).

## Open questions

- None blocking. If the `40px` REVEAL margin feels tight in the visual pass,
  it is one constant.
