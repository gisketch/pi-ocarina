# Spec: Selectors & Settings (shell amendment)

Status: approved (design re-import 2026-08-15). Amends
[2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md) — that spec is a
finished milestone-1 contract and stays frozen; where the two disagree, this file
wins. Visual truth: `PiOcarina Components.dc.html` §14 and the re-exported
`PiOcarina v2.dc.html` overlays. Behavior truth: this file.

## Problem & Outcome

The design import added a detached-fzf selector pattern and a settings surface
that milestone 1 predates. Outcome: the switcher gains fuzzy filtering, a
settings overlay exists, and one spotlight primitive serves every
detached-input-over-panel overlay (switcher, model selector).

## In Scope

Switcher fzf input, settings overlay, new key bindings (`m`, `,`, leader `m`/`s`),
the shared spotlight primitive, persistence of the new preferences.

## Out of Scope

The model/reasoning spotlight's contents and semantics (composer-controls spec,
D5). Everything the frozen shell spec already covers.

## Acceptance Behavior

### Keyboard additions (NORMAL)

- `m` toggles the model selector; the titlebar model chip (`<model> · m`) opens
  it on click.
- `,` toggles the settings overlay.
- Leader gains `m` (model selector) and `s` (settings); the which-key bar and
  keymap overlay show both.
- All frozen-spec rules still hold: overlays mutually exclusive, `esc` closes,
  typing in any fzf input never triggers NORMAL bindings.

### Switcher fzf

A detached input floats above the workspace card grid, autofocused on open
(`>` prompt, "fuzzy filter workspaces… ⏎ picks first", `esc` chip). Typing
filters the cards live; `⏎` picks the first match; number keys and clicks still
select; the "pin a folder…" card keeps the next number key. A filtered card
keeps its workspace's number, not its position in the filtered grid — the chip
is an address, not a row label.

Because the overlay now owns a caret, **`w` no longer toggles it closed**; it
types. `esc` and a backdrop click close it. The frozen shell spec's `w` toggle
still opens it.

### Settings overlay

Modal list of keyboard-centric rows; `j`/`k` moves the highlight (accent left
edge), `esc` closes. Rows:

- default model — shows the current model; `⏎` opens the model selector.
- reasoning effort — `h`/`l` cycles off/low/med/high (accent value).
- grain texture — `⏎` toggles on/off.
- motion — `⏎` toggles; off behaves exactly like the OS reduce-motion
  preference.
- workspace identity — fixed "pixel 5×5" in v1 (display only).
- leader timeout — `h`/`l` adjusts (default 2.6s).
- keymap — `⏎` opens the keymap overlay.

### Persistence

Grain, motion, leader timeout, and default model/reasoning persist in the
catalog and restore on launch.

## Settled Constraints

- The detached-input-over-panel spotlight is one component, parameterized —
  the switcher and the model selector (D5) both use it.
- The settings overlay participates in the shell mode machine; no global key
  handlers of its own.

## Validation

- Headless tests: new key routes, fzf filter/pick, settings row actions,
  persistence round-trip.
- Visual review vs §14 and the v2 overlays; `pnpm check`.

## Risks

- Adding an autofocused input to the switcher moves it from a pure-NORMAL
  overlay to an input-owning one; the mode machine's typing guards must cover it
  like the palette input.
