# Chrome that says less, and focus that shows more — tickets

Spec: [2026-08-18-chrome-and-focus.md](../../specs/2026-08-18-chrome-and-focus.md)

Status legend: `todo` · `in-progress` · `done`.

## F1 — the status bar drops what the reader can already see — `todo`

> Two segments out. Smallest ticket here and blocked by nothing.

- `Statusbar.svelte` — remove the `thread {app.threadLabel}` segment and the
  `paused` segment added by the chat-polish spec. Everything else keeps its
  place; nothing moves to fill the gap.
- `app.threadLabel` and `following.of(...)` lose a caller each: check whether
  either is now dead and delete it if so.
- The jump pill stays. It is an action a reader takes, not an indicator.
- Acceptance: the bar shows workspace, branch, permission, lsp, context,
  usage and hints, and nothing else; the pill still appears when paused with
  new content below.
- Validation: a browser pass with the transcript paused, screenshotted.

## F2 — the model in the column header — `todo`

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

## F3 — the focus band, and the dim goes — `todo`

> The largest of the three. A full-bleed highlight behind the focused block
> replaces the grey-out of everything else.

- The dim is threaded through `ThreadView`, `Ledger`, `GroupRow`,
  `ReasoningBlock` and `Message` as a `dimmed` prop, plus the token sets in
  `tokens.css`. All of it comes out — the prop, the classes, and the tokens.
- The band is one mechanism for every block kind (spec constraint), drawn
  without changing any block's layout. The spec's question 1 decides what
  draws it; whatever it is must survive the transcript's paint containment and
  reach both column edges through the column's padding.
- Keep: which blocks are focusable, every keybinding, the leap overlay's
  behaviour, and the ring's scroll-into-view.
- Acceptance: `j`/`k` through a message, a ledger row, a group and a card —
  the band lands on each, full width, nothing else changes appearance;
  releasing focus removes it.
- Validation: a browser pass in both themes with screenshots; a check that no
  `dimmed` prop or dim token survives.
- Blocked by: nothing, but land it after F1 and F2 — it touches the most
  files, and the other two are independent.
