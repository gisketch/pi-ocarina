# PiOcarina Architecture — Grill Working File

Status: **settled** (grill completed 2026-08-15; user-confirmed). Graduated into
five canonical specs — see [README.md](README.md). This file remains the decision
record and open-risk register.

Design reference: [docs/reference/design/](../reference/design/) (v2 shell +
component library). Stack and process boundaries: see
[project-brief.md](../project-brief.md) and [architecture/index.md](../architecture/index.md).

## Settled (from setup)

- Electron main hosts pi `AgentSession` in-process; renderer is Svelte 5, pure view
  over typed IPC; SessionDriver adapter owns pi-event → UI-event translation.
- Milestone 1 = static shell (mock data); milestone 2 = pi vertical slice.
- Local-only issue tracking; macOS-first.

## Component inventory to cover (from the design)

Shell: titlebar · workspace rail · thread strip (niri) · composer · statusbar ·
terminal drawer · leader bar · switcher · command palette · keymap overlay.
Thread: user/agent messages · markdown · streaming caret · tool ledger (read, grep,
write, edit+diff, bash ok/fail, fetch, todo, running) · ask card · approve card ·
checkpoint/rewind · queued steering · compacting · subagent nesting · tool errors
(timeout/cancelled/denied).
Controls: model selector · reasoning effort · skill loaded · slash commands ·
attachments (chips, drop, inline expand) · @-mention picker · thread minimap ·
history search.
Git/shell: commit card · terminal · git statusbar segments · toasts · confirm
modal · connection banner.
System: pixel identicons (5×5 hash) · seeded oklch accents · workspace notes (♪) ·
skeletons · ctx meter · token/cost display.

## Decisions

1. **Domain model (2026-08-15): workspace = pinned local folder; thread = one pi
   session.** Threads live in pi's own session store (cwd = workspace folder), so
   `pi` CLI and PiOcarina share history and resume interoperably. The app keeps a
   thin catalog in Electron `userData`: pinned folders + order, seeded hue, workspace
   note, thread→session mapping, last-focused strip positions. Accepted risk:
   coupled to pi's session-file format; the SessionDriver adapter is the single
   place that absorbs format changes.
2. **Concurrency (2026-08-15): all `AgentSession`s run in the Electron main
   process.** The SessionDriver contract (async, message-shaped, no shared memory
   with callers) must stay `utilityProcess`-portable so any session can be moved out
   of process later without renderer changes. Accepted risk: a pathological session
   stall affects the whole app until profiling justifies isolation.
3. **Projection (2026-08-15): event-sourced, one reducer.** SessionDriver emits a
   versioned UI-event vocabulary; a per-thread reducer (renderer) folds events into
   the view model. Opening a thread replays its pi session through the same reducer
   — live and resume share one code path. Reducer is pure and unit-tested against
   recorded pi-event fixtures; unknown event kinds render as a visible fallback row,
   never dropped silently. Accepted cost: replay CPU on very large sessions
   (mitigate: virtualized scrollback, lazy expansion).
4. **Lifecycle (2026-08-15): no daemon; the app process is the work's lifetime.**
   Window close hides to dock, threads keep running, completion raises a native
   notification + toast. Explicit quit with running threads raises the destructive
   confirm modal. The design's "RECONNECTING TO PI DAEMON" banner is reinterpreted
   as provider/network connectivity state. ADR-worthy: adding a daemon later is a
   major refactor; consciously deferred.
5. **Approvals (2026-08-15): per-workspace policy in the app catalog.** "Allow
   once" answers the pending request only; "always allow" persists a
   workspace-scoped rule (command pattern / tool kind), revocable in settings.
   Inside the GUI, app policy is the single source of truth; the adapter maps it
   onto pi's approval hook. Open risk: exact shape of pi's SDK permission API —
   verify during the vertical-slice milestone.
6. **Checkpoints (2026-08-15): conversation-only rewind, honestly labeled.**
   Restore truncates/forks the pi session at the checkpoint; the working tree is
   never touched. Requirement: the UI must make this transparent at the moment of
   restore — checkpoint copy states files are not rewound (e.g. restore confirm:
   "rewinds the conversation; your files keep later edits"), so users are never
   misled into believing file state reverted. Terminal: per-workspace pty (design
   answer), node-pty in main process.
7. **Failure policy (2026-08-15): auto-retry transient, manual after relaunch.**
   Transient (network, 5xx, rate limit): thread stays "running", amber banner with
   countdown + "retry now", capped exponential backoff, in-flight turn resumes.
   Hard (auth, 4xx, refusal): thread → failed (red dot), ledger error row with
   manual retry, toast when unfocused. App relaunch mid-turn: thread opens as
   "interrupted" with explicit continue — no silent resumption.
8. **Validation (2026-08-15): types + fixtures + eyes.** `svelte-check`/`tsc` fast
   lane; reducer unit tests against recorded pi-event fixtures (from milestone 2);
   headless keyboard-layer state-transition tests; visual review side-by-side with
   the reference HTMLs. No screenshot diffing; drift guarded by design-token
   discipline (all color/spacing via CSS custom properties). Playwright e2e joins
   when integration is real.

## Defaults (low-contest, recorded without a dedicated question — flag to reopen)

- **Git data**: main process shells out to `git` CLI (`--porcelain=v2`),
  event-driven refresh (fs-watch on `.git/HEAD`/index + after agent tool events);
  no fixed polling. Commit card runs git directly (not through pi).
- **Provider auth/models**: reuse pi's own config/auth (`~/.pi`); PiOcarina stores
  no API keys. Model selector and reasoning control map to pi SDK options.
- **Ctx / token / cost display**: sourced from pi usage events via the adapter;
  never computed independently.
- **Identicons/accents**: the design's exact hash + `oklch(0.76 0.14 hue)` formulas
  (already in the reference files) are the spec.

## Open Risks

- pi SDK surface assumptions to verify in the vertical slice: approval-hook shape,
  session truncate/fork for checkpoint rewind, usage-event availability,
  queued-steering + compaction APIs, subagent event nesting.
- pi session-file format stability (absorbed in SessionDriver only).
- node-pty + Electron ABI rebuilds on Electron upgrades.
- Departure Mono licensing/bundling check before shipping binaries.

## Open Questions

- Domain model: what a workspace and a thread map to on disk / in pi.
- Session persistence and resume across app restarts.
- Concurrency model: threads running in parallel; process-per-session?
- Permission/approval flow wiring to pi.
- Terminal ownership (per workspace? per thread?).
- Git data source (who computes status/diffs).
- Failure handling: agent crash, provider errors, offline.
- Ctx/token/cost data source.
- Checkpoint/rewind semantics.
- Validation strategy per subsystem.
