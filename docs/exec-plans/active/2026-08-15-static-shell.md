# Exec Plan: Static Shell (Milestone 1)

Spec: [2026-08-15-shell-navigation.md](../../specs/2026-08-15-shell-navigation.md)
(+ static interiors drawn visually from
[2026-08-15-thread-ledger.md](../../specs/2026-08-15-thread-ledger.md), mock data
only). Visual truth: [docs/reference/design/](../../reference/design/).

Status legend: `todo` · `in-progress` · `done`.

## T1 — Scaffold & dark frame — `done`

- Delivered behavior: `pnpm dev` boots an Electron window into the PiOcarina dark
  chrome: titlebar (wordmark, ocarina dots, right status text), empty content
  area, statusbar with static segments. Fonts (Departure Mono, JetBrains Mono)
  bundled locally; design tokens defined as CSS custom properties; grain overlay
  and accent tint layers present.
- Acceptance: window opens frameless-styled per reference at 1440×900; no CDN
  requests; `pnpm check` (svelte-check + tsc) passes and is wired in package.json.
- Validation: `pnpm check`; visual side-by-side vs reference titlebar/statusbar.
- Blocked by: —

## T2 — Workspaces: rail, identicons, accents — `done`

- Delivered behavior: mock catalog module (3 reference workspaces: pi-core D/152,
  ocarina-ui F♯/265, docs-site A/45). Rail renders 5×5 identicons (design hash
  formula), active/inactive opacity, `+` and `?` slots. `1–3` and rail clicks
  switch workspace; accent custom property + tint gradient + titlebar note/name +
  statusbar segments re-tint with the design's transition timing.
- Acceptance: switching workspace updates every accent-bound element with no
  layout shift; identicons match the reference renderings exactly (same hash → same
  pixels).
- Validation: unit test for the identicon hash against reference-derived fixtures;
  `pnpm check`; visual review.
- Blocked by: T1

## T3 — Thread strip: columns, focus, motion — `done`

- Delivered behavior: per-workspace strip with fixed 780px columns (placeholder
  interiors), translateX slide with `cubic-bezier(.22,1,.36,1)` 500ms, `h`/`l`
  and arrows move focus with dim/border states, `j`/`k` scrolls focused column,
  clicks focus columns, docs-site shows the empty-workspace hero, workspace switch
  restores each strip's remembered position, reduce-motion disables the slide.
- Acceptance: strip motion is a single composited transform (verified in DevTools
  layers); focus clamps at ends; per-workspace positions persist across switches
  (in-memory).
- Validation: headless store tests for focus/clamp/restore logic; manual ProMotion
  smoothness check; `pnpm check`.
- Blocked by: T2

## T4 — Keyboard layer: modes, leader, keymap — `done`

- Delivered behavior: the full mode state machine (NORMAL/INSERT/LEADER) as a pure
  module driving focus; composer strip present as the INSERT target (`i`/`esc`,
  accent border + glow, placeholder text; sending does nothing yet); `␣` leader
  with which-key bar, 2.6s timeout, chords (`1–3`, `n`, `w`, `t`, `k`, `h/l`,
  `c` no-op); `?` keymap overlay; statusbar mode chip; typing-guard rules from the
  spec (INSERT swallows letters, `esc`/`⌘K` always work, `1–3` pass over overlays).
- Acceptance: every binding in the spec's keyboard table behaves as written;
  no binding fires while typing except the documented exceptions.
- Validation: headless key-sequence tests covering the spec table including guard
  cases (the spec's acceptance list is the test list); `pnpm check`.
- Blocked by: T3

## T5 — Overlays: switcher & command palette — `done`

- Delivered behavior: `w`/leader-w workspace switcher (cards with identicon, note,
  branch, snippet, number chip; click/number selects; "pin a folder…" card inert);
  `⌘K` command palette (shared list primitive, fuzzy filter, `↑↓`+`⏎`, commands
  wired to real actions: jump, new-thread → hero, next thread, keymap, compact
  no-op); overlay exclusivity, `esc`/backdrop close, fade/rise motion.
- Acceptance: overlays are mutually exclusive; palette input focus does not leak
  keys; all listed commands perform their action.
- Validation: headless tests for exclusivity + palette filter/act; visual review.
- Blocked by: T4

## T6 — Static thread interiors — `done`

- Delivered behavior: the reference's mock threads rendered inside columns from
  static view-model fixtures (thread-ledger visual vocabulary, no reducer): user/
  agent messages, streaming caret, tool ledger rows (all variants incl. running
  pulse), expandable bodies (read preview, grep matches, diff, bash output, todo),
  ask card (clickable select → answered state), approve card (allow/deny → status
  line), column header states (done/running/idle).
- Acceptance: milestone-1 brief lines "ask card, approve card, and tool-ledger
  expand/collapse respond to clicks" pass; interiors match the reference columns.
- Validation: component smoke tests mounting each block variant from fixtures;
  visual review vs reference columns; `pnpm check`.
- Blocked by: T3 (parallel with T4/T5)

## T7 — Drawer, persistence, ProMotion pass — `done`

> Verified: catalog round-trip, corrupt-file recovery (warns and falls back to
> defaults), and layout restore on relaunch all confirmed against the real
> Electron app. Transition audit shows zero layout-animating properties.
> **Outstanding for the user:** the subjective 120fps/ProMotion judgement, which
> can only be made by watching the real window.

- Delivered behavior: static terminal drawer (`t`, slideup, static prompt content);
  layout persistence to a real catalog JSON in `userData` (pins, focused
  workspace/thread, restored on relaunch; corrupt file → defaults + warning);
  final polish pass: full-shell visual review against `PiOcarina v2.dc.html`, and
  the milestone's frame-perfect check (strip slide + overlay open while a column
  animates, zero visible jank on ProMotion).
- Acceptance: every line of the milestone-1 acceptance list in
  [project-brief.md](../../project-brief.md) demonstrably passes; relaunch restores
  layout.
- Validation: catalog read/write unit tests incl. corruption; manual ProMotion
  session; `pnpm check`.
- Blocked by: T4, T5, T6

## T8 — Switcher fzf, settings overlay, spotlight primitive — `todo`

> Added 2026-08-15 after the design import gained Components §14 (detached-fzf
> selectors) and the v2 shell gained `m`/`,`/leader-`s` and the settings modal.

- Delivered behavior: the shell-side half of §14. (1) The workspace switcher
  gains the detached fzf input above the card grid: autofocused, live-filters
  the cards, `⏎` picks the first match, numbers/clicks still work. (2) The
  settings overlay on `,` and leader `s`: rows per the shell spec — default
  model (opens the model selector shell; wiring to real config is D5),
  reasoning `h`/`l`, grain toggle, motion toggle (acts as reduce-motion),
  workspace identity display, leader timeout `h`/`l`, keymap. `j`/`k` highlight,
  `esc` close; grain/motion/leader-timeout persist in the catalog. (3) The
  detached-input-over-panel spotlight becomes a shared primitive so the switcher
  and D5's model selector are the same component, parameterized.
- Acceptance: leader hint bar and keymap overlay show the new chords; overlays
  stay mutually exclusive; typing in the fzf input never triggers NORMAL
  bindings; toggled settings survive relaunch; motion-off disables the strip
  slide exactly like OS reduce-motion.
- Validation: headless tests for the new key routes, fzf filter/pick, and
  settings persistence round-trip; visual review vs §14 and the v2 overlays;
  `pnpm check`.
- Blocked by: T7

## Order

T1 → T2 → T3 → {T4 → T5, T6} → T7 → T8
