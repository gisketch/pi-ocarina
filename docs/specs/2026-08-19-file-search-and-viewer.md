# File search and the file viewer column

Status: **grilled 2026-08-19.** Decisions D1–D10 settled; awaiting implementation.

## Problem

The app can find threads but not files. A reader who wants to open a file the
agent mentioned, or check a file before asking about it, must leave the app.
The `␣f` slot today opens the thread picker — a duplicate of `/` search and
the `w` switcher.

## Desired outcome

- `␣f` opens a file search over the focused workspace: the Telescope dialog,
  fast enough that typing never lags.
- Picking a file opens it in a new column: a vim buffer with real motions,
  editing, and `:w`-family commands.
- File chips in chat open the same buffer column.
- The mode line grows honest names: the strip's mode is its own, the buffer's
  modes are vim's.

## Decisions

- D1: The buffer is a full editor, not a viewer. It loads the file; the reader
  edits; `:w` writes bytes to the real file in the workspace. pi edits the same
  files concurrently, so `:w` checks staleness: when the file changed on disk
  after load, `:w` refuses with "file changed on disk — :w! to overwrite", and
  `:w!` writes anyway. The same contract vim itself has.

- D2: The engine is CodeMirror 6 with `@replit/codemirror-vim`, owned behind
  our own seam. One module (`lib/editor/`) wraps it; components import the
  wrapper, never CodeMirror itself. Our `:` commands go through
  `Vim.defineEx`, our keybinds through `Vim.map`, our look through a theme
  extension. When we outgrow a piece of it, the seam is where the replacement
  lands. Accepted gap: its vim is ~95% of vim (no `q` macros, limited `:g`).

- D3: Mode names and the ladder. The strip's mode is `OCARINA` (today's
  NORMAL, renamed). Typing to pi is `CHAT` (today's INSERT, renamed). `NORMAL`
  and `INSERT` now mean vim, inside a focused buffer column. From OCARINA on a
  buffer column, `Enter` enters vim NORMAL and `i` enters vim INSERT directly —
  `i` keeps meaning "start typing here" on every column kind. Escape walks one
  rung: INSERT → NORMAL → OCARINA; CHAT → OCARINA. READ, DIFF, TERM and LEADER
  keep their names and jobs.

- D4: `␣f` opens file search. Nothing is lost: `␣f` was a duplicate door to
  the thread content search, and `/` still opens that screen. The file search
  uses the existing Telescope dialog — list left, preview right.

- D5: One file, one column. A picked file opens its own buffer column directly
  right of the focused column; picking a file already open focuses its column
  instead of duplicating it. `:q` closes the focused buffer column, `:qa`
  closes every buffer column, `:wq` writes then closes, `!` variants skip the
  unsaved-changes refusal. The strip is the buffer list — every open file is a
  visible column, walked with h/l from OCARINA. Accepted cost: many open files
  make a long strip.

- D6: One telescopic shell. The frame Telescope already draws — backdrop,
  sheet, two panes, header — is extracted into a shared shell component. The
  thread picker, the file search, and the diff viewer all wear it, so the
  three read as one dialog family. Behavior stays per screen: the finders keep
  the caret-owns-every-key contract, DIFF keeps its own keys (j/k, Tab, n/N,
  y). Placeholder wording across every finder goes generic — "search files…",
  "search threads…" — the words "fzf" and "fuzzy" leave the UI.

- D7: Clean buffers follow the disk; dirty buffers hold. A buffer with no
  unsaved edits reloads itself when pi changes the file — the reader watches
  edits land live. A buffer with unsaved edits keeps them and shows a "file
  changed on disk" line; D1's `:w` refusal protects both sides. The cursor is
  restored after a reload, best effort. Needs a watcher per open buffer.
- D8: Search stays under the keystroke. The picker reuses the main-process
  file index (`listFiles`), stale-while-revalidate: opening shows the cached
  index at once and re-walks behind, updating the list when the walk returns.
  A first-ever open shows a loading row while the walk runs. Matching narrows
  incrementally — a longer query filters the previous hit set, never the full
  index — and the list renders only the top hits (capped, virtualized if the
  cap alone is not enough). Budget: keystroke to paint under 16ms typical,
  under 50ms on a 50k-file index; measured, not assumed.
- D9: File chips in assistant prose are detected, not requested. An inline
  code span whose text is a path that resolves against the workspace file
  index renders as a chip; activating it opens the buffer column, at the line
  when the text carries a `:line` suffix. No prompt engineering: pi already
  writes paths in backticks, so detection rides the existing convention.
  A path that resolves to nothing stays plain code — a chip must never 404.
- D10: Keybind ownership splits at the buffer edge. OCARINA, CHAT, READ,
  DIFF and LEADER bindings stay in the `SHIPPED_KEYS` registry, editable on
  the Keymaps screen; the new enter-buffer keys join it. Inside the buffer,
  vim is the keymap — rebinds there go through the editor seam (`Vim.map`),
  not the registry, and are out of scope for v1. Config compatibility: a
  saved binding with mode `NORMAL` predates the rename and is read as
  OCARINA; the new vim NORMAL is not addressable from the config file.

## Acceptance behavior

- `␣f` opens the file search in the telescopic dialog: generic placeholder,
  list left, file preview right, no lag while typing.
- Enter on a hit opens that file as a buffer column directly right of the
  focused column; a file already open focuses its existing column.
- The status bar says OCARINA on the strip, CHAT in the composer, NORMAL and
  INSERT inside a buffer. Escape walks INSERT → NORMAL → OCARINA.
- `Enter` on a focused buffer column enters vim NORMAL; `i` enters INSERT.
  Real vim motions work; `:w` writes, `:q` closes the column, `:wq` both,
  `:qa` closes every buffer column, `!` forces.
- `:w` on a file that changed on disk after load refuses and names `:w!`.
- A clean buffer shows pi's edits as they land; a dirty one holds and warns.
- A path in assistant prose that exists in the workspace renders as a chip;
  activating it opens the buffer column at the mentioned line.
- The diff viewer wears the same dialog shell as the finders.
- Every new action appears on the Keymaps screen and is rebindable.
- Old config files with `NORMAL` bindings keep working, read as OCARINA.

## Constraints

- The renderer never touches the filesystem; read, write, stat and watch go
  through `src/shared/` commands to the main process.
- CodeMirror imports live only inside the editor seam module.
- The 350-line file ceiling holds; the editor seam splits before it swells.

## Validation

- Reducer tests for the ladder: every mode's Escape rung, both buffer entry
  keys, and that OCARINA answers exactly what NORMAL answered before.
- Editor seam tests: `:w` stale refusal, `:w!` override, `:q` dirty refusal,
  `:qa`, and reload-on-clean via a faked watcher event.
- Finder test: incremental narrowing returns the same hits as a full match.
- A measured pass on a large repo for the latency budget.
- A live pass: fork nothing — open, edit, `:w`, watch pi edit the same file.

## Risks

- The vim plugin is SDK surface we do not control; its gaps (macros, `:g`)
  surface as reader-facing "vim does not do that here" moments.
- Watcher per buffer on huge repos is fine; watcher on network drives is not
  guaranteed — a missed event degrades to the D1 stale check, never to loss.
- The NORMAL rename touches every spec and doc that says NORMAL; a sweep is
  part of the work, or the docs lie.

## Open questions

- None. Scope splits into two spec-sized halves at ticket time: (1) finder
  shell + file search + diff-viewer reskin, (2) modes + buffer column +
  chips. Half 2 depends on half 1's picker only for entry, not for build.
