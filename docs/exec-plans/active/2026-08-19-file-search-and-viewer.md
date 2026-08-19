# File search and the file viewer — tickets

Spec: `docs/specs/2026-08-19-file-search-and-viewer.md` (D1–D10).

Two halves. T1–T4 ship the finder family; T5–T9 ship the modes and the
buffer. The halves only meet at T7 (the buffer opens from the picker), so
they can be worked in parallel up to there.

## T1 — the telescopic shell

Status: done

Behavior: the thread picker looks exactly as it does today, but its frame —
backdrop, sheet, two panes, header — lives in one shared shell component
that other dialogs can wear (D6).

Steps:

1. New `src/renderer/src/components/overlays/TelescopeShell.svelte`: the
   markup and CSS that `Telescope.svelte` draws around its content today.
   Snippet slots: header, left pane, right pane. No behavior — the shell
   owns pixels only.
2. `Telescope.svelte` keeps its whole contract (caret owns every key,
   fuzzy filter, preview) but renders through the shell.
3. Placeholder sweep (D6): `SwitcherOverlay.svelte` "fuzzy filter
   workspaces…" and every other user-visible "fzf"/"fuzzy" string goes
   generic — "search workspaces…", "search threads…". Grep the renderer for
   both words; code comments may keep them, the UI may not.
4. Tests: existing ThreadPicker/Telescope tests stay green untouched — the
   reskin is proven by their silence. One new test only if the shell grows
   any logic (it should not).

Acceptance: thread picker pixel-family unchanged, placeholders generic,
no "fzf" in any rendered string.

Blocked by: nothing.

## T2 — backend: file read, write, stat

Status: done

Behavior: the renderer can read a workspace file, stat it, and write it
back with a staleness guard (D1) — through `src/shared/`, never `node:fs`.

Steps:

1. `src/shared/commands.ts`:
   - `readFile { workspaceId, path }` →
     `{ text, mtimeMs } | { missing: true }`. Path is workspace-relative;
     the handler resolves against the workspace root and refuses a path
     that escapes it (`..`, absolute) with a plain error.
   - `writeFile { workspaceId, path, text, expectMtimeMs }` →
     `{ mtimeMs }`. When the file's mtime on disk differs from
     `expectMtimeMs`, refuse with the exact string the editor shows:
     `file changed on disk — :w! to overwrite`. `expectMtimeMs: null`
     forces (the `:w!` path).
   - `statFile { workspaceId, path }` → `{ mtimeMs } | { missing: true }`.
2. New `src/main/session/workspace-files.ts` (or beside `listFiles`'s
   handler — follow where `listFiles` lives): the three handlers, path
   guard shared.
3. Tests in a temp dir: read round-trip, write bumps mtime, stale write
   refuses with the exact message, force write ignores mtime, path escape
   refused, missing file shape.

Acceptance: commands exist, stale write refuses, escape refused.

Blocked by: nothing.

## T3 — file search on `␣f`

Status: done

Behavior: `␣f` opens a file search in the telescopic dialog: cached index
at once, re-walk behind, top hits only, preview of the highlighted file's
head. Enter hands the path to a callback (T7 wires the buffer; until then,
Enter closes the picker and toasts the path — demoable alone).

Steps:

1. `keyboard-types.ts`: overlay `'filefind'`; `keyboard.ts`
   `TYPING_OVERLAYS` += it.
2. `keyboard-leader.ts` case `'f'`: overlay `'filefind'` instead of
   `'search'`. `keymap.ts` `leader.find` label becomes `find file`.
   `/` (search threads) untouched (D4).
3. `files.svelte.ts`: `refresh(workspaceId)` — stale-while-revalidate: keep
   serving the cached list, re-invoke `listFiles`, swap when it returns
   (D8). Picker calls it on open. First-ever open (no cache) shows a
   loading row.
4. New `src/renderer/src/components/overlays/FileFind.svelte`: Telescope
   over the index. `text` = path. Preview pane: `readFile` of the
   highlighted hit, first ~200 lines, plain `<pre>`; debounced only by
   highlight movement, never by typing. Placeholder: `search files…`.
5. D8 narrowing in `fuzzy.ts` or Telescope: when the new query extends the
   old one, filter the previous hit set, not the full list; cap rendered
   hits (~50). Falls back to full match when the query shrinks.
6. Tests: leader `f` opens `filefind`; narrowing returns the same hits as
   a full match (property-style over a fixed list); cap holds; refresh
   swaps the list without clearing the query.

Acceptance: `␣f` opens file search, typing never waits on a walk, preview
shows the file head, Enter resolves a path.

Blocked by: T1 (shell), T2 (readFile for the preview).

## T4 — diff viewer wears the shell

Status: done

Behavior: the changes viewer draws inside the same shell as the finders
(D6). Every DIFF key does exactly what it did.

Steps:

1. `DiffViewer.svelte`: replace its hand-built sheet/pane markup with
   `TelescopeShell`, keeping its own header content (filter line, counts)
   and both panes' bodies as they are.
2. Visual pass in the browser preview: focused-pane accent, filter line,
   long-list scroll.
3. Tests: existing changes/diff tests stay green untouched.

Acceptance: one dialog family across picker, file search, diff viewer;
DIFF behavior byte-identical.

Blocked by: T1.

## T5 — the great rename: OCARINA and CHAT

Status: done

Behavior: the status bar says OCARINA on the strip and CHAT in the
composer. Every key answers exactly as before. Old configs keep working.

Steps:

1. `types.ts`: `Mode = 'OCARINA' | 'READ' | 'CHAT' | 'LEADER' | 'TERM' |
   'DIFF' | 'NORMAL' | 'INSERT'` — the last two now mean vim, used by T7;
   nothing enters them yet.
2. Mechanical sweep: every `'NORMAL'` literal in the renderer becomes
   `'OCARINA'`, every mode-literal `'INSERT'` becomes `'CHAT'`
   (`keyboard*.ts`, `app.svelte.ts`, `shell*.ts`, components, tests).
   `agent-lsp` find_references on the Mode type keeps the sweep honest;
   grep catches the string literals in tests.
3. `keymap.ts`: `ShippedKey.mode` values follow. Config compatibility
   (D10): when reading a `KeyBinding`, `NORMAL` is accepted as an alias
   for `OCARINA` and `INSERT` for `CHAT` (`keymapProblems` does not flag
   them; `buildKeymap` translates). New configs write the new names.
4. Status bar + which-key strings follow. Docs sweep: grep `docs/` for
   NORMAL/INSERT where they mean our modes; fix or the docs lie (spec
   risk).
5. Tests: full suite is the sweep's proof; plus one alias test — a config
   binding with mode `NORMAL` lands on OCARINA.

Acceptance: no behavior change, status bar reads OCARINA/CHAT, old config
bindings still land.

Blocked by: nothing (parallel to T1–T4).

## T6 — the editor seam

Status: todo

Behavior: one module owns CodeMirror. It can be created headless-tested
around: the vim `:` commands and the dirty/stale logic are pure callbacks.

Steps:

1. `pnpm add codemirror @codemirror/state @codemirror/view
   @codemirror/language @codemirror/language-data @replit/codemirror-vim`.
2. New `src/renderer/src/lib/editor/` (D2):
   - `editor.ts`: `mountEditor(host, opts)` → handle. Opts:
     `{ text, path, onSave(text, force), onQuit(force), onQuitAll(force),
     onModeChange(vimMode), onDirtyChange(dirty) }`. Returns
     `{ setText(text, keepCursor), focus, enterNormal, enterInsert,
     isDirty, destroy }`. All CodeMirror imports live here and in siblings.
   - `ex-commands.ts`: pure — registers `w`, `q`, `wq`, `qa` (+`!`) via
     `Vim.defineEx`, each delegating to the opts callbacks. Exported as a
     function taking a callback bag, so tests drive it with fakes and no
     DOM.
   - `theme.ts`: CodeMirror theme extension from the app's CSS variables.
   - Language by extension via `@codemirror/language-data` lazy load.
3. Tests (node env, no DOM): `ex-commands` — `:w` calls onSave(force:
   false), `:w!` force, `:wq` saves then quits, `:qa` quits all, unknown
   force flags refused. Dirty/stale decision table as pure functions.
4. `check-sonata` note: the seam splits before 350 (`editor.ts`,
   `ex-commands.ts`, `theme.ts` are already three files).

Acceptance: module exists, ex-command logic tested without a browser,
no CodeMirror import outside `lib/editor/`.

Blocked by: nothing (parallel).

## T7 — the buffer column

Status: todo

Behavior: picking a file in `␣f` (or an already-open path) opens a buffer
column right of the focused column. Enter/`i` from OCARINA drop into vim
NORMAL/INSERT (D3). `:w` writes with the stale guard, `:q` closes the
column, `:qa` closes every buffer column (D5).

Steps:

1. New `src/renderer/src/lib/state/buffers.svelte.ts`: open buffer
   registry — `{ path, columnId, mtimeMs, dirty }` per entry.
   `open(workspaceId, path, line?)`: already open → focus its column;
   else `readFile`, insert a buffer column right of the focused column
   (reuse `withThreadAfter`'s placement idea on the catalog, the way the
   terminal column inserts), remember mtime.
2. Strip: buffer column kind, like the terminal column's pattern — new
   `src/renderer/src/components/strip/FileColumn.svelte` hosting
   `mountEditor`. Header: file path, a `+` dirty mark.
3. Keyboard: on a focused buffer column, OCARINA `Enter` →
   `mode = 'NORMAL'` + `enterNormal()`; `i` → `'INSERT'` + `enterInsert()`.
   `onModeChange` mirrors vim's real state back into `app.mode` (vim owns
   the truth; Escape inside the editor walks INSERT → NORMAL). A second
   Escape in vim NORMAL blurs the editor → OCARINA. While mode is
   NORMAL/INSERT the editor owns every key (same routing rule as TERM).
4. Wire the seam callbacks: `onSave` → `writeFile` with `expectMtimeMs`
   (null when forced); refusal string lands in the editor's notice line,
   not a toast. `onQuit` → dirty and not forced → refuse with
   `unsaved changes — :q! to discard`; else close the column. `onQuitAll`
   → same over every buffer column.
5. `T3`'s Enter callback now calls `buffers.open` (replace the toast).
   New SHIPPED_KEYS entries for the enter keys if they are to be
   rebindable (D10) — group `buffer`.
6. Tests: open dedupes to a focus; column lands right of focused; `:q`
   dirty refusal message; `:qa` closes only buffer columns; stale `:w`
   surfaces the T2 message; mode mirror INSERT → NORMAL → OCARINA.
   (Editor internals stay untested here — T6 covered the ex logic; these
   tests fake the seam.)

Acceptance: spec's buffer acceptance list, minus live edits by pi.

Blocked by: T2, T3, T5, T6.

## T8 — the watcher: clean buffers follow the disk

Status: todo

Behavior: pi rewrites an open file; a clean buffer reloads and the cursor
stays put (best effort); a dirty buffer holds and shows
`file changed on disk` (D7).

Steps:

1. `src/shared/commands.ts` + events: `watchFile { workspaceId, path }` /
   `unwatchFile`, event `fileChanged { workspaceId, path, mtimeMs }`.
   Main-process `fs.watch` per watched path, debounced (~50ms — editors
   write twice).
2. `buffers.svelte.ts`: watch on open, unwatch on close. On `fileChanged`:
   clean → `readFile`, `setText(text, keepCursor: true)`, update mtime;
   dirty → set the stale flag the column's notice line renders.
3. `FileColumn.svelte`: notice line for stale + refusal strings.
4. Tests: temp-dir watcher fires on write (main side); renderer decision
   table — clean reloads, dirty flags, reload updates the mtime so a
   later `:w` is not falsely stale.

Acceptance: clean buffer shows pi's edit without a keypress; dirty buffer
warns and `:w` still refuses per D1.

Blocked by: T7.

## T9 — file chips in prose

Status: todo

Behavior: an inline code span in assistant prose whose text resolves in
the workspace file index renders as a chip; Enter/click opens the buffer
column, at the line when the text is `path:line` (D9). A path that
resolves to nothing stays plain code.

Steps:

1. Pure helper `src/renderer/src/lib/file-mention.ts`:
   `asFileMention(code, files) → { path, line } | null`. Accepts
   `path`, `path:12`, leading `./`; requires the path (sans line) to be in
   the index. No heuristics beyond membership — a chip must never 404.
2. `Inline.svelte` (assistant prose only): code spans through the helper;
   hits render as the existing chip look with a click/keyboard handler
   calling `buffers.open(workspaceId, path, line)`.
3. `mountEditor` gains `revealLine(line)`; `buffers.open` passes it.
4. Tests: helper table (hit, miss, line suffix, `./`, directory, escape
   attempt); Inline render swaps chip vs code by index membership.

Acceptance: chip opens the file at the line; unknown paths unchanged.

Blocked by: T7.

## T10 — review and fix

Status: todo

`/sonata-review` over the feature commits; fix findings; full suite +
svelte-check + check-sonata on touched files; the docs sweep from T5
verified.

Blocked by: T3, T4, T8, T9.

## Out of plan

- Live pass (spec validation, reader-gated): open a file, edit alongside a
  running pi turn, `:w` races, watcher latency on a real repo, the D8
  latency budget measured on a 50k-file tree.
- Vim rebinds through `Vim.map` config (D10 defers to v2).
- `:e`, `:b`, splits, macros — vim surface beyond the spec's list.
