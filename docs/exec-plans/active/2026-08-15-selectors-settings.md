# Exec Plan: Selectors & Settings

Spec: [2026-08-15-selectors-settings.md](../../specs/2026-08-15-selectors-settings.md)
(amends the frozen shell-navigation spec). Visual truth:
`PiOcarina Components.dc.html` §14 + re-exported `PiOcarina v2.dc.html`.

Status legend: `todo` · `in-progress` · `done`.

## F1 — Spotlight primitive & switcher fzf — `done`

> Verified in the running app: the detached input floats above the card grid,
> typing filters live, and `⏎` picks the first match and jumps. A filtered card
> keeps its **workspace** number, not its row number, so `3` still means the
> third pinned workspace after filtering.
>
> One behaviour change worth naming: **a second `w` no longer closes the
> switcher.** The overlay now owns a caret, so `w` types. Closing is `esc` or a
> backdrop click. Leaving `w` as a toggle would make a workspace named "web"
> impossible to filter for.
>
> The three fuzzy matchers became one (`lib/fuzzy.ts`). The palette had its own;
> the switcher and D5's selector would have been two more, and a user who learns
> filtering in one place should have learned it in all three.

- Delivered behavior: the detached-input-over-panel spotlight as one shared,
  parameterized component; the workspace switcher rebuilt on it — autofocused
  fzf input above the card grid, live filtering, `⏎` picks the first match,
  numbers/clicks unchanged, "pin a folder…" keeps the next number key.
- Acceptance: typing in the input never triggers NORMAL bindings; filter + first-
  match pick behave per spec; frozen-spec switcher behavior (numbers, clicks,
  esc, exclusivity) unchanged.
- Validation: headless fzf filter/pick and typing-guard tests; visual review vs
  §14; `pnpm check`.
- Blocked by: —

## F2 — Settings overlay & preferences — `todo`

- Delivered behavior: settings on `,` and leader `s` (leader also gains `m`;
  which-key bar and keymap overlay updated). Rows per spec: default model
  (opens the model-selector spotlight shell; real model list is D5), reasoning
  `h`/`l`, grain toggle, motion toggle (acts as reduce-motion), workspace
  identity display, leader timeout `h`/`l`, keymap. `j`/`k` highlight, `esc`
  close. Grain/motion/leader-timeout persist in the catalog.
- Acceptance: toggled settings survive relaunch; motion-off disables the strip
  slide exactly like OS reduce-motion; leader timeout change takes effect on the
  next leader press.
- Validation: headless key-route and row-action tests; persistence round-trip
  test; visual review vs §14; `pnpm check`.
- Blocked by: F1

## Order

F1 → F2

D5 (composer plan) consumes F1's spotlight primitive for the two-step
model/reasoning selector.
