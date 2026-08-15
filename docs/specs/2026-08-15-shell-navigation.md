# Spec: Shell & Navigation

Status: approved (from grill 2026-08-15). Visual truth:
[reference/design](../reference/design/) — `PiOcarina v2.dc.html`. Behavior truth: this file.

## Problem & Outcome

pi work across several repos needs spatial, keyboard-first navigation. Outcome: an
Electron shell where pinned workspaces each hold a horizontal strip of thread
columns, driven entirely from the keyboard, feeling frame-perfect on ProMotion.

## In Scope

Titlebar, workspace rail, niri-style thread strip, statusbar, leader layer,
workspace switcher (detached fzf), settings overlay, command palette, keymap
overlay, mode system (NORMAL / INSERT / LEADER), workspace accent tinting, motion
rules. Static/mock data satisfies this
spec (milestone 1); it must not change when real sessions arrive.

## Out of Scope

Thread content (see thread-ledger spec), composer behavior beyond focus modes (see
composer-controls), terminal drawer content (see git-terminal), session backend.

## Structure

- **Workspace**: pinned local folder. Rail shows 5×5 identicon (hash + oklch
  formulas in the reference are normative), active at full opacity, others at 35%.
  `+` pins a folder via native directory picker. Workspaces carry: name (folder
  basename), seeded hue, note (♪ letter), branch, git summary, thread list.
- **Thread strip**: one horizontal strip per workspace; columns are fixed-width
  (780px design width), focused column centered, unfocused dimmed to 40% opacity.
  Strip position moves only via `transform: translateX`; easing
  `cubic-bezier(.22,1,.36,1)` 500ms (the design's `stripTrans`), disabled when the
  user's reduce-motion preference is set.
- **Empty workspace** shows the fresh-thread hero (identicon, name, hint keys).

## Keyboard Model (acceptance behavior)

Modes: NORMAL (default), INSERT (composer focused), LEADER (transient, 2.6s
timeout). Statusbar mode chip reflects mode instantly; INSERT/LEADER chips use the
workspace accent.

In NORMAL:

- `1–3` (and future `4+`) jump to that pinned workspace. Also honored while an
  overlay is open (closing it first).
- `h`/`l` (and arrows) move thread focus left/right, clamped at ends.
- `j`/`k` scroll the focused column.
- `i` focuses the composer → INSERT. `esc` in INSERT returns to NORMAL.
- `t` toggles terminal drawer; `w` toggles switcher; `?` toggles keymap overlay.
- `m` toggles the model selector (behavior in composer-controls spec); `,` toggles
  the settings overlay. The titlebar model chip (`<model> · m`) opens the selector
  on click.
- `y` yanks the last code block of the focused thread to clipboard.
- `␣` enters LEADER and shows the which-key hint bar; then `1–3` jump, `n` new
  thread, `w` switcher, `t` terminal, `h/l` thread move, `m` model selector,
  `s` settings, `k` keymap, `c` compact (delegated to thread), `esc`/timeout/
  unknown key cancels.
- `⌘K` toggles command palette from any mode; palette input autofocuses.
- `esc` closes any overlay; overlays are mutually exclusive.

Typing in INSERT (or palette input) must never trigger NORMAL bindings except the
`1–3`-with-overlay rule above and `esc`/`⌘K`.

## Overlays

Switcher (detached fzf pattern per v2 + Components §14): a floating input sits
detached above the workspace card grid, autofocused on open (`>` prompt, "fuzzy
filter workspaces… ⏎ picks first"). Typing filters the cards live; `⏎` picks the
first match; number keys and clicks still select; the "pin a folder…" card keeps
the next number key; `esc` closes.

Settings (`,`, leader `s`; Components §14 "keyboard-centric rows"): a modal list of
rows, `j`/`k` moves the highlight (accent left edge), `esc` closes. Rows and their
actions:

- default model — shows the current model; `⏎` opens the model selector.
- reasoning effort — `h`/`l` cycles off/low/med/high (accent value).
- grain texture — `⏎` toggles on/off.
- motion — `⏎` toggles on/off; off behaves exactly like the OS reduce-motion
  preference.
- workspace identity — fixed "pixel 5×5" in v1 (display only).
- leader timeout — `h`/`l` adjusts (default 2.6s).
- keymap — `⏎`/`?` opens the keymap overlay.

Grain, motion, leader timeout, and the default model/reasoning persist in the
catalog and restore on launch.

Command palette: fuzzy-filtered command list with kbd hints; commands cover at
least the keymap's actions. Keymap overlay: four-column cheat sheet as designed.
All overlays: fade/rise animations from the reference; backdrop blur allowed
(transient only); overlays stay mutually exclusive.

## Statusbar

Segments: mode chip · ♪ note + workspace · branch + git summary · thread x/y ·
(right) ctx meter % · tokens + cost · key hints. Data may be mock in milestone 1
but each segment binds to a single store selector so real data is a drop-in.

## Settled Constraints

- All motion `transform`/`opacity` only; strip is one composited layer; no layout
  animation. Grain overlay = static SVG tile; accent tint = single radial gradient
  layer, `background` transitions 400–500ms.
- Workspace accent = `oklch(0.76 0.14 <hue>)`; hue seeded per workspace, persisted
  in the catalog. Every accent-colored element reads one CSS custom property.
- Fonts bundled locally: Departure Mono (chrome/labels), JetBrains Mono (body).
- Layout state (pins, order, focused workspace/thread per strip) persists in the
  catalog and restores on launch.

## Validation

- Headless keyboard tests: key event sequences → expected mode/focus/overlay state
  (pure state machine, no DOM).
- `svelte-check`/`tsc` clean.
- Visual review side-by-side with the reference file at 1440×900.
- Manual ProMotion check: strip slide and overlay open with zero visible jank while
  a column streams mock updates.

## Risks

- Keyboard event routing between webview focus states (composer vs palette vs pty
  later) is the classic leak point; the mode state machine must be the single
  arbiter, with focus changes driven by it, not vice versa.
