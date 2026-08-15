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
  order), last-focused positions, approval rules. Corrupt catalog → rebuilt
  empty with a visible warning, never a crash; pi session files remain the
  transcript truth. Main is the sole writer — the renderer sends its position
  and nothing else, so a layout save cannot erase a pin.
  **Revised in B3:** the catalog does *not* map threads to pi sessions.
  `SessionManager.list(cwd)` reads them from pi's own store, so threads started
  by the `pi` CLI appear for free and the app can never disagree with pi about
  what exists. Thread ids are pi session ids.

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

## Verified against pi 0.84.2 (B2, 2026-08-15)

- **Usage events: confirmed.** `session.getSessionStats()` returns pi's own
  token, cost, and context-window figures. The backend passes them through and
  estimates nothing.
- **Event granularity: confirmed sufficient.** `message_start` / `message_update`
  (`text_delta`) / `message_end` and `tool_execution_start` / `_update` / `_end`
  cover the streaming and ledger vocabulary. Thinking deltas exist and are
  currently dropped.
- **Failures are not events.** A refused or broken model call arrives as an
  ordinary assistant message with `stopReason: "error"` and an `errorMessage` —
  there is no error event. Anything that only listens for events will report a
  failed turn as a successful one. The adapter checks the stop reason.
- **pi ignores `cwd` when building tools.** `createAgentSession({ cwd })` uses
  cwd for the session file and project resources, but its built-in tools resolve
  paths against `process.cwd()`. Verified directly: a session rooted at a temp
  folder read files from the Electron process's directory. Since workspaces are
  folders and several run in one process, the driver rebuilds the built-in tools
  bound to the workspace cwd and replaces `agent.state.tools`. Re-test on every
  pi upgrade; a utilityProcess per workspace would remove the need.
- Tool names `find` and `ls` have no row in the design's vocabulary and render as
  `raw` rather than being mislabelled. The design may want a listing row.
- **Approvals: pi has no permission system.** It offers a `tool_call` extension
  hook that runs before a tool executes and can block it (`{ block, reason }`),
  and the handler may await a promise — which is what lets the gate wait on the
  user. So *what* requires approval is entirely this app's policy, not pi's.
  **The policy (B4):** the mutating tools (`bash`, `write`, `edit`) ask;
  read-only tools never interrupt. "Always" is remembered per workspace, keyed
  by tool — except `bash`, which is keyed by the *program* (`bash:pnpm`), since
  approving `pnpm install` must not silently permit every future shell command.
- **An inline extension needs `await loader.reload()`.** A freshly constructed
  `DefaultResourceLoader` holds no extensions, so passing one to
  `createAgentSession` without reloading it means the hook never runs and every
  tool call is silently allowed. Verified: the gate is real only after reload.
- `tool_call` fires *after* `tool_execution_start`, so the ledger row opens, the
  approve card appears, and the row then settles — which is what the design's
  approve card already implies.
- **Checkpoint restore: confirmed, and it is non-destructive.**
  `session.navigateTree(entryId)` moves within the session tree, so the
  abandoned branch stays on disk and the filesystem is never touched — verified
  by writing a file after a checkpoint and finding it intact after restoring.
  Checkpoints are user-message entry ids. Note the semantics: pi rewinds to
  *before* the chosen message (it hands the text back for re-editing), so
  restoring to the first checkpoint empties the thread. The rebuilt conversation
  comes from `buildContextEntries()`, preceded by a `thread-reset` event.
- **Steering: confirmed.** `session.steer(text)` queues during a turn and is
  delivered at the next step boundary. pi reports the queue's *contents* via
  `queue_update`, never its transitions, so delivery is detected by watching an
  entry leave the queue.
- **Retries: pi already has them.** `auto_retry_start` carries the attempt and
  delay, `auto_retry_end` the outcome. The app translates these into the
  connectivity banner instead of running a second retry loop of its own, which
  would fight pi's.
- **Compaction: confirmed, and it belongs to the event stream, not the command.**
  pi also compacts on its own at a threshold, so translating `compaction_start`
  / `compaction_end` is the only way automatic runs are visible. A refusal
  (`result: undefined`, e.g. "nothing to compact") is reported as a skipped
  note, never as a failed thread.

## Risks

- pi SDK surface assumptions for approvals, fork, steering and compaction remain
  unverified — B4 and B6 close them.
- Session-file format drift across pi versions: absorbed here only; pin the pi
  package version and treat upgrades as Behavior-lane changes with fixture re-runs.
- In-process stall blast radius (accepted): a pathological session can stall the
  app until the utilityProcess move is justified by profiling.
