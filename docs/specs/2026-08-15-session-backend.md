# Spec: Session Backend

Status: approved (from grill 2026-08-15). This is the milestone-2 contract; no UI
in this spec.

## Problem & Outcome

The renderer needs a stable, pi-agnostic event stream and command surface for any
number of concurrent agent threads. Outcome: a main-process subsystem that hosts pi
`AgentSession`s in-process and exposes one typed seam (the SessionDriver) to the
UI, honoring the grill's lifecycle, failure, and approval decisions.

## In Scope

SessionDriver interface, workspace/thread catalog, session lifecycle, event
translation and versioning, approvals enforcement, failure/retry policy, app
lifecycle behavior, IPC transport, checkpoint (conversation-only) rewind.

## Out of Scope

Rendering, git status (git-terminal spec), pty management (git-terminal spec).

## Boundaries (settled)

- pi runs **in-process in Electron main** via `AgentSession` from
  `@earendil-works/pi-coding-agent`. Renderer never imports `@earendil-works/*`
  (mechanically enforced once lint exists).
- **SessionDriver** is the only seam: commands in
  (`createThread`, `openThread`, `prompt`, `steer`, `answerAsk`, `resolveApproval`,
  `cancelTurn`, `restoreCheckpoint`, `compact`, `setModel`, `setReasoning`,
  `archiveThread`), events out (versioned UI-event vocabulary consumed by the
  thread reducer). The contract is async and message-shaped — no shared memory —
  so a session can move to a `utilityProcess` later without renderer change.
- **Catalog** (Electron `userData`, JSON): pinned workspaces (path, hue, note,
  order), thread→pi-session mapping, last-focused positions, approval rules.
  Corrupt catalog → rebuilt empty with a visible warning, never a crash;
  pi session files remain the transcript truth.

## Acceptance Behavior

- Threads are pi sessions (domain decision): creating a thread creates a pi
  session with cwd = workspace folder; resuming replays the session file through
  the same event path as live streaming (projection decision). Sessions created by
  `pi` CLI in a pinned folder appear in that workspace's thread list.
- Concurrency: N threads stream simultaneously; events carry thread identity;
  one thread's failure never affects another's stream.
- Approvals: a pi permission request surfaces as an `approve` event; `allow-once`
  resolves once; `always` persists a per-workspace rule to the catalog and
  auto-resolves future matches (main process enforces — the renderer is not
  trusted with policy); `deny` refuses and the ledger shows `denied`. Rules are
  listable and revocable via driver commands (settings UI later).
- Failure policy (as decided): transient errors auto-retry with capped backoff,
  emitting connectivity-banner events (`degraded` → countdown, `restored`); hard
  errors emit thread `failed` with a typed reason; `retryTurn` command re-runs.
  Relaunch mid-turn → thread state `interrupted`, explicit `continue` required.
- Lifecycle (as decided): window close hides app, sessions keep running,
  completions raise native notification + toast event when unfocused; quit with
  running threads requires confirmation (renderer asks, main blocks quit until
  answered); confirmed quit aborts turns cleanly so session files stay valid.
- Checkpoint restore: forks/truncates the pi session at the checkpoint id and
  reopens the thread from the fork; never touches the working tree.
- Ctx/tokens/cost: usage events pass through from pi per thread (defaults
  decision); the backend never estimates independently.

## Settled Constraints

- Event vocabulary is versioned; unknown pi event kinds map to a `raw` UI event
  (visible fallback row downstream). Adapter is the only file that knows pi types.
- Event batches to the renderer are coalesced (per-thread, ~1 animation frame) —
  transport granularity is the backend's job, not the reducer's.
- Provider auth/model list come from pi's own config (`~/.pi`); the app stores no
  keys. Auth absence surfaces as a typed hard error the UI can route to guidance.

## Validation

- Driver-level integration test against a real pi session in a fixture repo
  (cheap model or recorded transport): prompt → streamed events → session file on
  disk → resume replays identically (same reducer fixture both ways).
- Unit tests: approval rule matching, retry/backoff state machine, catalog
  corruption recovery.
- The vertical-slice milestone is this spec's proving ground; the five "pi SDK
  surface" open risks in the architecture file must each get a verified answer
  (approval hook, session fork, usage events, steering, compaction) and the spec
  updated where reality differs.

## Risks

- pi SDK surface assumptions (above) — highest uncertainty in the project.
- Session-file format drift across pi versions: absorbed here only; pin the pi
  package version and treat upgrades as Behavior-lane changes with fixture re-runs.
- In-process stall blast radius (accepted): a pathological session can stall the
  app until the utilityProcess move is justified by profiling.
