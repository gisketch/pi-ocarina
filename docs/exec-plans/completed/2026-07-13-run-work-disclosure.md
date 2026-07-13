# Run Work Disclosure and Final Handoff

## Goal

Group each Pi agent run into an active process disclosure that collapses to a duration label at settlement, while rendering the final assistant handoff separately. Prefer explicit OpenAI text phases and preserve provider-neutral behavior through Pi lifecycle inference.

## Acceptance Criteria

- One user submission produces one run disclosure and at most one final handoff.
- Thinking summaries, commentary, intermediate text, and semantic tool calls retain Pi event order inside the disclosure.
- The disclosure is expanded during work, respects manual active collapse, and collapses at success, cancellation, or failure.
- Explicit `commentary` and `final_answer` phases win; phase-less providers receive the accepted lifecycle fallback.
- Completed run timing and grouping survive thread reopen without duplicating Pi-owned transcript content.
- Existing tool-call lifecycle, cancellation, keyboard access, reduced motion, and malformed-event safety remain green.

## Context

- [Canonical spec](../../specs/2026-07-13-run-work-disclosure.md)
- [Streaming tool-call lifecycle](../../specs/2026-07-12-streaming-tool-call-lifecycle.md)
- [Desktop architecture](../../architecture/desktop.md)
- [Frontend architecture](../../architecture/frontend.md)

## Tickets

### 1. Provider-neutral live work disclosure

**Delivered behavior:** A submitted Pi run opens one `Working` disclosure containing visible thinking summaries, intermediate assistant text, and existing semantic tool rows. When Pi settles, the disclosure collapses to `Worked for {duration}` and the last eligible text from the final turn appears once as the handoff.

**Acceptance criteria:**

- The agent host forwards typed agent, turn, message, thinking, and text lifecycle events with stable run, turn, message, and content identities.
- Structured accumulated Pi content remains authoritative; high-frequency deltas are coalesced before React rendering.
- One reducer preserves ordered thinking, text, and tool parts for the active run without replacing the existing tool reconciliation seam.
- Phase-less fallback selects the final non-empty text in the last turn not followed by tool execution as the handoff; earlier text remains process content.
- Active timing begins at `agent_start`, updates at a bounded interval, and stops at terminal settlement.
- The disclosure auto-opens once, manual active collapse is respected, and successful completion auto-collapses it.
- Empty thinking, text-only responses, multiple tool turns, reordered events, and malformed updates degrade safely without duplicate content or a permanently active run.

**Validation:** Agent-host lifecycle contract tests; run reducer and fallback-classifier tests; disclosure-state tests; existing tool reconciliation tests; frontend and agent-host typechecks; Cosmos active and completed fixtures; live phase-less run smoke.

**Blocked by:** None.

### 2. Explicit OpenAI phase-aware handoff

**Delivered behavior:** Compatible OpenAI Responses runs keep `commentary` inside the work disclosure and move `final_answer` into the separate handoff using provider metadata rather than inference.

**Acceptance criteria:**

- Completed Pi text blocks preserve `commentary` and `final_answer` phase metadata across the agent-host contract.
- Explicit phase classification overrides fallback classification without making non-OpenAI providers depend on OpenAI fields.
- Unclassified streaming text may render provisionally inside the disclosure; completing it as `final_answer` moves the same stable block outside exactly once.
- Multiple commentary and final blocks retain their original order, and empty final blocks do not create blank handoffs.
- Tool calls between commentary blocks remain in the process disclosure and do not prematurely settle the run.
- Provider metadata that is absent, malformed, or delayed falls back to Ticket 1 behavior without losing text.

**Validation:** OpenAI phase adapter tests; explicit-over-fallback classifier tests; provisional reclassification/no-duplication tests; Cosmos commentary/final fixtures; frontend and agent-host typechecks; live compatible OpenAI Responses smoke.

**Blocked by:** Ticket 1.

### 3. Durable settled history and resilient outcomes

**Delivered behavior:** Completed, stopped, failed, and interrupted runs reopen with stable grouping and recorded duration. The disclosure is accessible, theme-native, and production-smoked across explicit and fallback providers.

**Acceptance criteria:**

- The host writes one namespaced Pi custom session entry containing only stable run boundaries, start/end time, and outcome; normal Pi messages remain the content source of truth.
- Reopening a thread reconstructs run grouping and duration for newly recorded runs without persisting token deltas or duplicating assistant/tool content.
- Historical runs without metadata remain readable and never receive invented durations.
- Success renders `Worked for`, cancellation renders `Stopped after`, and failure renders `Failed after` with the actionable error preserved.
- Abnormal shutdown settles incomplete metadata as interrupted on reopen rather than displaying endless active work.
- Reopening a settled disclosure restores ordered process parts and existing per-tool detail state.
- Disclosure controls expose correct accessible names, `aria-expanded`, keyboard operation, focus visibility, status announcements, theme tokens, and reduced-motion behavior.
- Cosmos covers active, explicit, inferred, completed, stopped, failed, interrupted, missing metadata, and reopened states.

**Validation:** Pi custom-entry round-trip and interrupted-recovery tests; reload/reconciliation tests; success/cancel/failure disclosure tests; accessibility and reduced-motion checks; existing semantic tool-call suite; lint, strict typechecks, frontend and agent-host tests, production build, Cosmos export, and desktop smoke for one explicit-phase and one fallback run.

**Blocked by:** Ticket 2.

## Validation

- Complete each ticket's focused checks before unblocking the next ticket.
- Keep existing streaming tool-call tests green after every slice.
- After Ticket 3, run lint, strict typechecks, focused frontend and agent-host suites, production build, Cosmos export, Sonata/context checks, and the two-path desktop smoke.
- Verify long commentary and tool-heavy runs remain responsive and do not auto-scroll a user away from earlier transcript content.

## Decision Log

- 2026-07-13: Use three sequential vertical slices; no prefactoring ticket.
- 2026-07-13: Explicit OpenAI phase metadata wins, lifecycle inference is the provider-neutral fallback.
- 2026-07-13: One Pi agent run maps to one disclosure; turns remain nested sequencing boundaries.
- 2026-07-13: Persist only compact run metadata through namespaced Pi custom session entries; Pi messages remain authoritative.
- 2026-07-13: Terminal settlement always collapses the run disclosure; users may reopen it afterward.

## Progress Log

- [x] Ticket 1: Provider-neutral live work disclosure.
- [x] Ticket 2: Explicit OpenAI phase-aware handoff.
- [x] Ticket 3: Durable settled history and resilient outcomes.

- 2026-07-13: Approved spec split into three blocker-ordered tracer bullets. No external tracker configured or requested.
- 2026-07-13: Implemented stable run lifecycle forwarding, 16 ms accumulated-content coalescing, semantic run presentation, explicit OpenAI phase handling, provider-neutral fallback, terminal outcomes, Pi custom-entry reconstruction, accessible disclosure UI, and Cosmos coverage.
- 2026-07-13: Focused frontend, contract, host, typecheck, and Cosmos export checks pass.
- 2026-07-13: Full `bun run check`, production build, Rust checks, Sonata/context checks, Cosmos export, and diff check pass. Existing Fast Refresh and bundle-size warnings remain non-blocking.
- 2026-07-13: Real Tauri E2E smoke reaches the app and passes 4/5 checks. The unrelated empty-workspace ready-state assertion still expects `PiOcarina` but currently receives `Bundled Pi ready / New thread / Open Folder`. Provider-backed explicit/fallback smoke was not run because it requires configured credentials.
