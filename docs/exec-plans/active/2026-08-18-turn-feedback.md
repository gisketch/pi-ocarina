# The transcript answers immediately — tickets

Spec: [2026-08-18-turn-feedback.md](../../specs/2026-08-18-turn-feedback.md)

Status legend: `todo` · `in-progress` · `done`.

## T1 — the follow lands on the true bottom — `done`

> Smallest of the four and independent of the rest. Fix first: the footer
> arriving at the end of a turn makes any shortfall more visible.

- `ThreadColumn.svelte` — the pin runs on the same frame the content grew, so
  `scrollHeight` is read before the browser has laid the new text out. Pin
  again after a frame (`requestAnimationFrame`), coalesced so a stream does
  not queue one per token.
- The second pin is skipped when the reader has scrolled away in between:
  following is checked at the moment it runs, not when it was scheduled.
- Acceptance: with a turn streaming, the last line of the newest block is
  fully visible; the reader's scroll-up still frees the view instantly.
- Validation: a browser pass measuring `scrollHeight - (scrollTop + clientHeight)`
  during a stream — it must reach zero, not merely a small number. **Deferred
  to T3**: the renderer harness's mock threads are static, and the working
  footer is the first thing in it that changes every second.

## T2 — one clock the whole app reads — `done`

> Something has to tick for a footer to count, and it must not be a timer per
> thread.

- There was already exactly this clock, built for agent rows: one interval,
  watcher-counted, stopped when nothing is running and while the window is
  hidden. It serves both now, so `agent-clock.svelte.ts` became
  `clock.svelte.ts` — a name that told the truth about one caller was going to
  mislead about the second.
- New `src/renderer/src/lib/elapsed.ts` — `elapsed(ms)`: `4s`, `12s`,
  `1m04s`, `12m` — a pure function with the minute boundary as its test.
- Acceptance: the formatter's cases; the clock stops when the last turn ends.
- Validation: `elapsed.test.ts`; a check that no interval is live at rest.

## T3 — the working footer — `done`

> The line at the end of pi's turn: live while it runs, final when it ends.

- Derived from the thread's run state and the turn's start, not sent by the
  backend — the spec is explicit that nothing about it reaches the session
  log. `ThreadViewModel` gains what it needs to know when the turn began.
- New `src/renderer/src/components/thread/TurnFooter.svelte`. Wording from
  the grill (`working…` / `worked for 1m04s`), drawn in the chrome font at
  the ledger's strength — it is a note about the turn, not a message.
- Placed as the last thing in the turn: content arriving after it pushes it
  down. A failed or interrupted turn says so rather than reading as finished.
- Appears within a frame of sending, before pi has said anything.
- Acceptance: send with the backend stubbed to stall — the footer is there and
  counting before any block arrives; it settles to the past tense on
  `turn_end`; a failed turn reads as failed.
- Validation: `thread-turn-span.test.ts` over run-state sequences; a browser
  pass confirming both the running and the finished footer render with the
  right words and tone.
- **Decisions taken here**, from the spec's open questions: the words are
  `working… 4s` / `worked for 1m04s`, with `stopped after 12s` for a failure
  and `interrupted after 12s` for a cancel. The clock is wall-clock from the
  transition into `running`, which is one IPC hop after the send. A gate does
  not stop it — the reader is still waiting. Only the *current* turn carries a
  footer; a per-turn history of them would need the reducer to keep a span per
  turn, and is not what was asked for.
- **Not verified in the harness**: the counter ticking. The Browser pane
  reports `visibilityState: hidden`, and the shared clock stops while the
  window is hidden — by design, and documented in `clock.svelte.ts`. The
  formatter and the clock are unit-tested either side of it.
- Blocked by: T2.

## T4 — one spine through a turn's work — `todo`

> A reasoning row draws on the ledger's spine rather than beside it.

- Today `ReasoningBlock` renders its own `.ledger` wrapper, so a turn that
  thinks, calls tools, then thinks again draws three disconnected fragments.
  The spine belongs to the run, not to the block.
- Two candidate shapes, and the grill's question 4 decides: a reasoning block
  joins the neighbouring ledger as a row of it, or the spine is lifted to
  something that spans a turn's consecutive work blocks.
- Whichever ships, the reasoning row keeps its own node, its own expansion,
  and its own nav id — this is about the line behind it.
- Acceptance: think → 3 calls → think draws one unbroken spine; hiding
  reasoning with `o` leaves the spine unbroken through what remains.
- Validation: a browser pass on a mock turn with that exact shape, screenshot.
