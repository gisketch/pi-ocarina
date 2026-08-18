# Chrome that says less, and focus that shows more — tickets

Spec: [2026-08-18-chrome-and-focus.md](../../specs/2026-08-18-chrome-and-focus.md)

Status legend: `todo` · `in-progress` · `done`.

## F1 — the status bar drops what the reader can already see — `done`

> Two segments out. Smallest ticket here and blocked by nothing.

- `Statusbar.svelte` — remove the `thread {app.threadLabel}` segment and the
  `paused` segment added by the chat-polish spec. Everything else keeps its
  place; nothing moves to fill the gap.
- `app.threadLabel` keeps its other caller (the title bar), so it stays.
- The jump pill stays. It is an action a reader takes, not an indicator.
- Acceptance: the bar shows workspace, branch, permission, lsp, context,
  usage and hints, and nothing else; the pill still appears when paused with
  new content below.
- Validation: a browser pass with the transcript paused, screenshotted.

## F2 — the model in the column header — `done`

> Each column says which model is answering in it.

- `ThreadColumn.svelte` header gains the model beside the title. The value is
  the same one the title bar shows for the focused thread; `app` already
  resolves live model over catalog listing for status, and the model needs the
  same treatment so a thread that has not spoken still names what it will use.
- Width discipline: the title stays readable and the model gives way first —
  the model is the fact a reader scans for, the title is the one they need.
- Acceptance: four columns on three models say so; a fresh thread names its
  model; a narrow column keeps its title.
- Validation: a browser pass at two column widths, screenshotted.

## F3 — the focus band, and the dim goes — `done`

> The largest of the three. A full-bleed highlight behind the focused block
> replaces the grey-out of everything else.

- The dim is threaded through `ThreadView`, `Ledger`, `GroupRow`,
  `ReasoningBlock` and `Message` as a `dimmed` prop, plus the token sets in
  `tokens.css`. All of it comes out — the prop, the classes, and the tokens.
- **Decided**: the column's inline padding moved off the scroll box and onto
  the blocks, so a block already spans the full width and its band is a plain
  `background`. A ledger row is nested one indent deeper, so its band is a
  pseudo-element reaching back out by exactly `--pad-column` — which lands on
  the block's padding box, which is where `content-visibility` clips, so it
  reaches the column edge and no further.
- The ledger's own indent had to move onto its rows. As a padding on the
  ledger it lost: Svelte scopes the column's `.body > *` rule with a class,
  which ties on specificity and wins on order — measured, the spine drifted
  two pixels off its nodes.
- Keep: which blocks are focusable, every keybinding, the leap overlay's
  behaviour, and the ring's scroll-into-view.
- Acceptance: `j`/`k` through a message, a ledger row, a group and a card —
  the band lands on each, full width, nothing else changes appearance;
  releasing focus removes it.
- Validation: measured in the browser — a block's band sits 0px from both
  column edges, a ledger row's reaches the same edges from one indent deeper,
  and the node and spine centres agree at 25.5px after the indent moved. No
  `dimmed` prop, `dim` class or dim token survives.
- Blocked by: nothing, but land it after F1 and F2 — it touches the most
  files, and the other two are independent.
