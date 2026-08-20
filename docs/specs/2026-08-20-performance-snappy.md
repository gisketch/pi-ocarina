# Performance: a snappy shell

Status: **implemented 2026-08-20**; measured results below. Parent:
[piocarina-architecture.md](piocarina-architecture.md). Amends nothing; every
fix below preserves the behavior contracts of the shell-navigation, thread
ledger, and attached-panes specs.

## Problem

Two felt lags, reported: switching workspaces stutters, and typing in the
terminal echoes late. A full audit found both root causes plus a tail of
compounding costs that grow with thread length and workspace count. The app
must feel instant at every input: a keystroke echoes within a frame, a
workspace switch lands within a frame or two, streaming in one column never
taxes another.

## Root causes (evidence, not guesses)

**Workspace switch rebuilds the world.** The strip wraps its columns in a
`{#key workspace.id}` block (there since the first static-shell commit, to
snap the slide transition), and the column list is keyed by thread ids — so a
switch unmounts every column of the old workspace and mounts every column of
the new one. `content-visibility` virtualization skips layout and paint for
off-screen blocks but not element creation or component setup, so the mount
synchronously pays: full markdown parse + segmentation per message, five
recursive walks per ledger, full tokenization per open tool body and fence,
one nav-registry write per block — roughly a megabyte of markdown and tens of
thousands of DOM nodes per switch on a real workspace. Terminals die too:
each switch disposes and rebuilds every xterm, its WebGL context, and its
glyph atlas.

**Terminal echo waits on a timer, and every key walks the whole modal
stack.** The main-process pty buffer coalesces output behind a trailing-edge
16 ms timeout with no leading edge — a single keystroke's echo always eats
the full window (and Node timers land late under load), before the renderer
even paints. On the renderer side, the TERM early-out lives at the bottom of
the key pipeline: every key typed into the pty first runs seven modal checks,
a DOM-touching stale-overlay sweep, and keymap translation.

**Streaming costs grow with the transcript, not with what changed.** Nothing
memoizes markdown parsing or highlighting. The streaming message re-parses
its whole text per token batch (quadratic over a turn); fences and tool
bodies tokenize as plain template functions, so they re-run whenever their
component renders; hiding thinking rebuilds every affected ledger's identity
per token, re-running all its walks; the READ nav list re-parses every
message in the thread per keypress and, once a ring exists, per token. The
follow pin runs a per-frame rAF loop that reads `scrollHeight` for the whole
life of a turn — a forced layout, per frame, per following column, defeating
the very virtualization the transcript exists on.

**Paint work where compositing would do.** Every unfocused pane member
carries an animated `filter: brightness() saturate()` — a raster + filter
pass over a live streaming column on every content change, exactly the cost
`docs/quality.md` warns only a frame-interval sweep can see. Overlays blur
the whole window with `backdrop-filter`; the grain layer is not on its own
compositor layer, so every repaint under it re-blends the tile.

## In scope

- Keep visited workspaces' strips mounted and hidden; a switch shows and
  hides, never rebuilds.
- Leading-edge pty flush; TERM bail at the top of the key pipeline; terminal
  resize dedupe.
- A shared, memoized parse/highlight layer for the transcript, and stable
  identity for the thinking filter.
- Ending the per-frame forced-layout loops (follow pin, reveal, visibility
  scan).
- Compositor-friendly dimming for unfocused panes; layer promotion for the
  grain.
- The per-keystroke tail: mention completion narrowing, drafts store
  granularity, status-bar IPC dedupe, git-status array churn, picker
  element registration.

## Out of scope

- JS windowing of blocks. `content-visibility` stays the virtualization; the
  ledger spec's reasons (selection, find-in-page, anchoring) still hold.
- Capping the initial transcript render to a tail that grows upward. Worth
  doing if keep-mounted alone misses the budget; it changes find-in-page
  and selection semantics, so it needs its own decision. Open question below.
- Any behavior change: keys, modes, ordering, and visuals (dimming may change
  mechanism, not look).
- Multi-window pty fan-out (main emits every chunk to every window) — noted,
  harmless single-window.

## Fixes, ranked

### P1 — the two reported lags

**W1 · Workspaces keep their strips.** Render one strip per visited
workspace; the active one is shown, the rest hidden with `display: none`.
The `{#key}` teardown goes away; each strip keeps its own slide offset, so
the transition-snap the key existed for comes free. Terminals survive the
switch — scrollback, atlas, and WebGL context intact. On reveal, a terminal
re-fits once and the strip re-measures once. Eviction: keep at most the N
most recently visited workspaces mounted (N≈4) — xterm holds 5000 lines of
scrollback per shell and browsers cap live WebGL contexts (~16 per page), so
unbounded keep-alive would trade one lag for a crash. Evicted workspaces pay
today's mount cost, visited ones pay nothing.

**T1 · Pty flush leads, then coalesces.** Flush immediately when nothing was
flushed within the window; arm the trailing timer only for the remainder.
Interactive echo ships on the same tick; build spew still batches.

**T2 · TERM bails first.** At the top of the shell's `handleKey`, when the
mode is TERM and the key is not Escape, return without consuming — the exact
rule the reducer already encodes, moved above the modal walk so a pty
keystroke touches nothing else. The reducer's own branch stays; the two must
never disagree.

**T3 · Terminal resize settles.** Cache the last `{cols, rows}` and return
early on no change; coalesce observer callbacks into one rAF. A width
transition stops round-tripping the shell per frame (SIGWINCH storm).

### P1 — streaming and typing costs that scale with the thread

**S1 · One parse, remembered.** A module-level cache for
`parseMarkdown(text)` and block highlighting, keyed on content (bounded LRU;
a streaming block overwrites its own entry, so the cache holds one entry per
live block). Fence and tool-body tokenization become `$derived` on
`(text, lang)` with a retained per-line state array — only lines at and after
the first change re-tokenize, which is the incremental design
`lib/highlight.ts` already documents but nothing calls. The READ nav list's
full-thread re-parse collapses to cache hits; additionally its derived should
answer from `focused` alone rather than rebuilding the list per token.

**S2 · The thinking filter keeps identity.** Memoize `withoutThinking` per
input block (WeakMap): a ledger whose filtered form is unchanged returns the
identical object, so its component never re-renders and its five walks never
re-run. Compute the filtered `shown` list once, shared by the thread view and
block navigation, memoized on blocks identity + the reasoning toggle.

**S3 · Measure on arrival, not per frame.** The follow pin loop stops
polling `scrollHeight` at 60 fps for the length of a turn: drive it from
content arrivals (ResizeObserver on the scroll content, or the existing
quiet-frames window without the `runState` gate), and run it only for
columns on screen. The block-reveal scroll measures its target once per
scroll, not per animation frame; the first-`j` visibility scan
binary-searches positions the way leap already does instead of measuring
every entry.

### P2 — paint and per-keystroke tail

**F1 · Dim by compositor.** Unfocused members lose the `filter`; the same
look via `opacity` and/or the token-remap pattern the leaping column already
uses. **F2 ·** The grain layer gets its own compositor layer. **F3 ·** The
overlay backdrop's full-window blur is measured with the frame-interval
sweep; if it shows, it becomes a translucent scrim (visual call — open
question).

**C1 · Mention completion narrows.** The composer's `@` filter uses the
existing `fuzzyNarrower` (as Telescope does) instead of rescoring the full
file index per keystroke; the fuzzy layer pre-lowercases its haystack once
and short-circuits the empty query instead of scoring-then-sorting fifty
thousand paths to slice fifty.

**C2 · A draft invalidates its own composer.** The drafts store stops
replacing one record per keystroke (which re-renders every composer on the
strip); per-column reactive boxes or a reactive map.

**C3 · The status bar asks once per destination.** The permission, modes,
and LSP loads memoize on their key (workspace/thread id) and skip repeats;
the two permission IPCs merge into one. Moving across the strip stops firing
3–4 round trips per keystroke and the chips stop flickering stale→fresh.

**C4 · A git status touches git state only.** Status pushes stop reassigning
the workspace array (which invalidates every reader and re-arms the
persistence debounce → disk write per `.git` change during builds/rebases):
either hold status in a side map keyed by workspace id, or make the
persistence effect compare its snapshot before scheduling a save.

**C5 · Small knives.** Ledger's five walks memoize on rows identity;
`markNodes` returns its input untouched when there are no attachments;
`titleOf` caches the first user block; both pickers (Telescope, keybinds)
register row elements instead of `querySelectorAll` per keystroke; the file
picker's index refresh gets a TTL instead of a re-crawl per open; the
tool-end git refresh fan-out debounces per thread.

### P3 — polish

- Prewarm the `node-pty` import at app start; spawn the pty with the
  column's real geometry instead of 80×24-then-reflow.
- Pty flow control: count unacknowledged bytes via xterm's write callback;
  pause/resume the pty around a high-water mark. Guards the worst case
  (a runaway `cat`), not the common one.

## Acceptance criteria (observable)

1. Switching between two visited workspaces (each ≥3 columns, ≥300 blocks)
   completes without a rebuilt transcript: terminal scrollback and thread
   scroll positions survive the round trip, and the switch renders within
   ~2 frames (no long task > 50 ms in a Performance trace).
2. At an idle prompt, a keystroke's echo is forwarded by main on the same
   tick it arrives from the pty (no mandatory 16 ms wait); typing in TERM
   runs none of the modal routing (unit-provable at the `handleKey` seam).
3. While a 400-line fence streams, per-batch highlight work is bounded by
   the changed tail, not the block length (parse/highlight cache hit-rate
   observable at the seam; no quadratic re-parse of the streaming message).
4. With thinking hidden, a streamed token re-renders only the streaming
   block: ledgers above the fold keep object identity (unit-provable on
   `withoutThinking` memoization).
5. During a running turn, following columns force no per-frame layout: a
   frame-interval sweep (methodology in `docs/quality.md`) shows no
   `scrollHeight` read per frame and no filter pass over unfocused columns.
6. One character typed in a composer re-renders no other column's composer;
   one `h`/`l` move fires at most one IPC per status-bar segment, and none
   on repeat visits to the same thread.
7. A burst of `.git` changes with no layout change produces no catalog
   writes.
8. The existing C5 forced-layout budget (8.34 ms) and the full test suite
   still hold; `pnpm check` clean.

## Implementation constraints and settled decisions

- The keyboard reducer stays pure and remains the single owner of mode
  transitions; T2 duplicates its TERM rule at the pipeline mouth and must
  read the same predicate, not a copy that can drift.
- `content-visibility` remains the only virtualization; no JS windowing.
- The pty channel stays separate from the session event stream.
- Keep-mounted strips must preserve the attached-panes contracts (magnetic
  lifecycle, group widths) untouched; hiding is `display: none`, not
  unmounting.
- Caches are bounded (LRU / WeakMap); nothing grows with session length.
- Dimming may change mechanism but not the visible design.
- Sonata size smell: `shell.svelte.ts` and `ThreadColumn.svelte` are at or
  over the 350-line line; work here splits by responsibility rather than
  growing them.

## Measured (2026-08-20, `pnpm bench` + web harness)

Same workloads, same seams, before and after. The bench is repeatable:
`pnpm bench` (scripts/bench/perf.bench.ts, config vitest.bench.config.ts).

| workload | before | after | change |
|---|---|---|---|
| B1 streamed turn: message parse + nav list, 100 batches over a 100-message thread | 632.5 ms | 134.9 ms | 4.7× |
| B2 streaming 400-line fence, tokenize per batch × 50 | 38.3 ms | 2.4 ms | 16× |
| B3 thinking filter, 100 tokens × 300 blocks | 11.8 ms | 1.9 ms | 6.2× |
| B3 fresh ledger identities across that run | 15 000 | 0 | — |
| B4 held `j`: nav list per keypress × 200 | 1274 ms (6.4 ms/press) | 97.8 ms (0.49 ms/press) | 13× |
| B5 `@`-mention filter, 50k paths, three keystrokes | 37.6 ms | 15.5 ms (narrower seam) | 2.4× |
| B5 file picker open, 50k paths, empty query | 11.8 ms | 0.06 ms | 196× |
| pty echo at an idle prompt | ≥16 ms flush timer | same-tick (leading edge, test-proven) | — |
| workspace revisit switch | full remount of every column and xterm | show/hide of a kept strip, ~6 ms sync JS (web harness) | — |

Structural proofs (unit): TERM bail before the modal walk; leading-edge pty
flush order and coalescing; `withoutThinking` identity; parse/segment/fence
cache identity; fuzzy empty-query no-scan; drafts per-column invalidation.
Web-harness proof: three workspaces resident at once, hidden strips
`display: none`, no console errors across switches. Frame-feel (filter
removal, pin loop) is to be judged in the Electron window per
`docs/quality.md`'s frame-interval methodology.

## Validation evidence expected

- Unit, at public seams: pty buffer leading-edge flush timing (fake timers);
  `handleKey` TERM bail; `withoutThinking` identity; parse-cache hit on
  repeated text; fuzzy empty-query short-circuit; drafts isolation.
- Frame-interval sweeps (per `docs/quality.md` methodology) before/after for:
  workspace switch, focus move across panes, streaming with thinking hidden,
  overlay open over a streaming column.
- Manual in real Electron (`pnpm dev`): typing feel at an idle prompt and
  under `yes`-style spew; workspace round trip with live terminals.

## Risks and open questions

- **WebGL context cap / memory** with keep-mounted terminals — mitigated by
  the visited-workspace cap (N≈4) and, if needed, disposing only the WebGL
  addon (not the terminal) for hidden workspaces.
- **`display: none` reveal costs**: hidden subtrees drop layout state, so
  first reveal pays one relayout — measure; if it shows, prefer
  `content-visibility: hidden` on the inactive strips, which keeps state.
- **Streaming tail-parse** (parsing only past the last stable block
  boundary) is the true fix for the quadratic streaming message; the LRU
  only removes cross-render waste. If per-batch parse of a very long message
  still shows after S1, tail-parse is the follow-up.
- **Open:** initial-render tail cap (render last N blocks, grow upward) —
  needed only if W1 misses the switch budget on cold (evicted) workspaces.
- **Open:** backdrop blur — keep (aesthetic) or scrim (cost), pending the
  sweep measurement.
- **Open:** high-water mark for pty flow control (P3) — pick by measuring
  xterm drain rate on target hardware.
