# Exec Plan: Session Backend (Milestone 2)

Spec: [2026-08-15-session-backend.md](../../specs/2026-08-15-session-backend.md).
Architecture decisions: [piocarina-architecture.md](../../specs/piocarina-architecture.md).

This plan is the proving ground for the five unverified pi SDK assumptions
(approval hook, session fork, usage events, steering, compaction). Each ticket
that touches one must record the verified answer in the spec's Risks section —
where reality differs, the spec is updated before the ticket closes.

Status legend: `todo` · `in-progress` · `done`.

## B1 — Driver seam & event vocabulary — `done`

> Verified: the whole path (renderer → preload → main → driver → batcher →
> renderer) round-trips a scripted turn in a real Electron run, unknown kinds
> included. Run it with `PIOCARINA_SEAM_DEMO=1 pnpm dev`.


- Delivered behavior: the `SessionDriver` contract exists as code: typed command
  surface (`createThread`, `openThread`, `prompt`, `steer`, `answerAsk`,
  `resolveApproval`, `cancelTurn`, `restoreCheckpoint`, `compact`, `setModel`,
  `setReasoning`, `archiveThread`, `retryTurn`) and the versioned UI-event
  vocabulary, defined in a shared types module the renderer imports (no
  `@earendil-works/*` in renderer). IPC transport with per-thread event batching
  coalesced to ~1 animation frame. A stub driver replays a recorded fixture stream
  so the seam is exercisable before pi is wired.
- Acceptance: renderer can subscribe to a thread's event stream and issue
  commands over the bridge; unknown event kinds pass through as `raw` events;
  batches for two concurrent threads interleave without cross-talk.
- Validation: unit tests for batching/coalescing and vocabulary versioning;
  `pnpm check`; fixture stream visible via a temporary debug tap.
- Blocked by: —

## B2 — pi vertical slice: live prompt → stream — `done`

> Verified live against pi 0.84.2: prompt → tool call → streamed text → usage →
> done, with the session file on disk. Two pi behaviours had to be worked around
> (silent failed turns, and tools ignoring cwd); both are written up in the
> spec's "Verified against pi" section. Run it with
> `PIOCARINA_PI_LIVE=1 pnpm test`.


- Delivered behavior: `AgentSession` from `@earendil-works/pi-coding-agent` runs
  in-process in main behind the driver. Creating a thread creates a pi session
  with cwd = workspace folder; `prompt` streams real agent/tool events through
  the adapter into the B1 vocabulary. Usage events (ctx/tokens/cost) pass through
  per thread. The adapter is the only file that knows pi types.
- Acceptance: a real prompt against a fixture repo streams text and tool events
  end-to-end to the renderer seam; usage figures arrive from pi (never
  estimated); pi package version is pinned. **Verifies risks: usage events,
  event granularity.**
- Validation: driver-level integration test (cheap model or recorded transport):
  prompt → streamed events → session file on disk; `pnpm test`.
- Blocked by: B1

## B3 — Real catalog: workspaces, threads, resume — `done`

> Verified live: pin a folder → new thread → prompt → dispose → a fresh driver
> lists the thread and reopens it, rebuilding the same conversation from disk.
> Two scope notes: threads are read from pi's session store rather than tracked
> in the catalog (pi is the truth, so the two cannot drift), and the rail still
> renders mock workspaces — swapping the UI onto the catalog needs the reducer
> and lands with C2.


- Delivered behavior: catalog v2 in `userData`: pinned workspaces (path, hue,
  note, order), thread→pi-session mapping, last-focused positions. Pinning a real
  folder replaces the mock workspace list. Opening a thread replays its pi
  session file through the same adapter/event path as live streaming; sessions
  created by `pi` CLI inside a pinned folder appear in that workspace's thread
  list. Corrupt catalog → rebuilt empty with visible warning.
- Acceptance: pin folder → new thread → prompt → quit → relaunch → thread
  reopens with identical projected history (same reducer fixture live and
  replayed); CLI-created session shows up on refresh.
- Validation: unit tests for catalog v2 migration + corruption recovery; the
  replay-equals-live fixture assertion; manual relaunch check.
- Blocked by: B2

## B4 — Approvals enforcement — `done`

> Verified live: a denied `echo` is blocked and the ledger row fails; "always"
> persists `bash:echo` for that workspace only; the next `echo` runs without
> asking. pi has no permission system of its own, so the policy is ours — see
> the spec's "Verified against pi" section.


- Delivered behavior: pi permission requests surface as `approve` events;
  `allow-once` resolves once; `always` persists a per-workspace rule to the
  catalog and main auto-resolves future matches (renderer never enforces
  policy); `deny` refuses and downstream shows `denied`. Driver commands list
  and revoke rules. **Verifies risk: approval hook.**
- Acceptance: the allow/always/deny triple behaves as specced across two
  workspaces (an `always` in one workspace does not leak to the other); rules
  survive relaunch; revoking a rule re-prompts.
- Validation: unit tests for rule matching/persistence; integration test driving
  a real permission-gated tool call through each of the three answers.
- Blocked by: B2

## B5 — Failure policy & app lifecycle — `todo`

- Delivered behavior: transient errors auto-retry with capped backoff emitting
  `degraded` (with countdown) / `restored` events; hard errors emit thread
  `failed` with a typed reason and `retryTurn` re-runs; missing provider auth is
  a typed hard error. Relaunch mid-turn → thread `interrupted`, explicit
  `continue` required — never silent resume. Window close hides to dock with
  sessions running; background completion raises a native notification + toast
  event; quit with running threads blocks on renderer confirmation and, when
  confirmed, aborts turns cleanly so session files stay valid.
- Acceptance: each failure-policy line above demonstrably happens (network cut →
  banner events + auto-retry; kill app mid-turn → `interrupted` on relaunch;
  quit-with-running prompts and aborts cleanly).
- Validation: unit tests for the retry/backoff state machine; scripted
  fault-injection at the adapter; manual lifecycle pass.
- Blocked by: B3

## B6 — Checkpoint restore, steering, compaction — `todo`

- Delivered behavior: `restoreCheckpoint` forks/truncates the pi session at the
  checkpoint id and reopens the thread from the fork — the working tree is never
  touched (conversation-only decision). `steer` delivers queued text at the next
  step boundary; `compact` runs pi compaction and emits before→after ctx usage.
  **Verifies risks: session fork, steering, compaction.**
- Acceptance: restore rewinds conversation while files keep later edits (proven
  by a fixture that edits a file after the checkpoint); steer text lands at a
  step boundary mid-turn; compaction round-trips with usage figures.
- Validation: integration tests for all three against a real session; spec Risks
  section updated with the verified pi answers.
- Blocked by: B3

## Order

B1 → B2 → {B3 → {B5, B6}, B4}
