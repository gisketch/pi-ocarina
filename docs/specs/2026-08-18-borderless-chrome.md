# Borderless chrome

Owner decision, 2026-08-18. Amends the visual contract of every renderer
surface. Reference mockups: `PiOcarina v2.dc.html`, `PiOcarina
Components.dc.html`, `PiOcarina Polish.dc.html` in the design project.

## Problem

Separation in the renderer is drawn twice: a hairline border *and* a
background step. The hairlines accumulate — a column inside a strip inside a
shell shows three of them within 20px — and they read as boxes rather than as
one continuous surface.

## Outcome

Separation comes from background lightness alone, NVChad-statusline style.
Flat surfaces at different steps, no rules between them.

## In scope

`src/renderer/**` only: `styles/tokens.css`, `styles/global.css`, every
`.svelte` component. Main, preload and shared are untouched.

## Rules

1. No `border`, `border-<side>`, or `outline` is used as a separator or as a
   container edge. Two regions that need distinction get different
   backgrounds.
2. A background is a translucent white-alpha tint over `--bg`, so the grain
   shows through and the hue never drifts. Solid tinted hexes read as a
   different hue than the alpha tints beside them — only a surface that must
   occlude what it covers (`--bg-float`, `--bg-rail`, `--bg-panel`,
   `--bg-deep`) is allowed to be opaque.
3. Selection and focus are a brighter background — accent-tinted where the
   state means something — never a change of border colour.

## Exceptions

These are not separators and stay:

- The ledger spine (`.ledger::before`, 1px, `--spine`) and the whole
  spine/node geometry block in `tokens.css`. A tool-call row keeps its spine
  and does not gain a raised panel background. Same for the group summary and
  the reasoning row.
- `border: none` and `outline: none` resets on inputs and buttons.
- The `.lit` focus band, which is already a background.
- The composer's insert-mode ring, `box-shadow: 0 0 0 3px var(--accent-soft)`
  — a focus ring, not an edge.

## Conversion rule

For any border not named below: if the element already paints a background,
delete the border. If the border was the element's only definition, replace it
with a background —

- white `rgba(255, 255, 255, a)` becomes `rgba(255, 255, 255, a * 0.6)`,
  clamped to `0.03 … 0.08`.
- a coloured border at alpha `a` becomes that colour as a background at
  `a * 0.3`.
- a hover `border-color` change becomes a hover background change.

## Per-surface

- **Titlebar** — `--bg-titlebar`.
- **Rail** — `--bg-rail`. Pin selection stays opacity-based.
- **Statusbar** — bar `--bg-statusbar`; segments alternate: mode block keeps
  its accent or `--bg-chip`, workspace `--seg-strong`, branch `--seg`, thread
  plain; the right side mirrors it — context plain, tokens `--seg`, key hints
  `--seg-strong`.
- **Thread columns** — focused `--bg-column-focus`, idle `--bg-column-idle`,
  keeping the existing opacity dim. Column headers `--bg-header`.
- **kbd chips** — `--bg-chip`, same padding.
- **Buttons** — an outlined ghost becomes a filled tint: accent-outlined gets
  an accent background at 0.15, neutral-outlined `rgba(255, 255, 255, 0.06)`.
  A primary filled button is unchanged.
- **Cards** — ask, approve, switcher, settings panels, toasts, modals, menus:
  the background does the work. Approve `rgba(233, 196, 106, 0.07)`, error
  output `rgba(224, 122, 107, 0.09)`, selected switcher card
  `oklch(0.76 0.14 var(--accent-hue) / 0.12)` over `--bg-panel`.
- **fzf rows** — the 2px selection edge becomes `--accent-soft` on the
  selected row, `rgba(255, 255, 255, 0.03)` unselected, `--bg-hover` on hover.
- **Composer** — `rgba(255, 255, 255, 0.025)` idle, `rgba(255, 255, 255,
  0.06)` in insert mode. Any `transition: border-color` becomes `transition:
  background`.
- **Code, diff and output blocks** — keep `--bg-deep`, drop the hairline.
- **Attachment chips** — open is accent-tinted at 0.16, closed `--bg-chip`.
- **Dashed placeholders** — the pin's empty slot becomes a solid
  `rgba(255, 255, 255, 0.05)` background.

## Acceptance

- `grep -rn "border" src/renderer/src --include="*.svelte" --include="*.css"`
  returns only the spine rules, `border: none` / `outline: none` resets, and
  `border-radius`.
- No new solid hex background outside `--bg-float`, `--bg-rail`, `--bg-panel`
  and `--bg-deep`.
- Focus and selection stay legible with the borders gone: column focus, fzf
  row selection, insert mode, approve card.
- `--line-faint`, `--line`, `--line-mid` and `--line-strong` are gone. One
  token survives, renamed `--spine`, and the spine is all it draws.

## Validation

Eye test in `pnpm dev:web`. The existing checks (`pnpm check`, `pnpm test`,
`./scripts/check-sonata.sh`) still pass; this is CSS and carries no new
behaviour to test.
