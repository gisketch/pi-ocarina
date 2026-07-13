# Queue Editor Execution Plan

## Goal

Expose Pi's live per-thread message queue above the composer, then let users safely edit, delete, or promote pending work without interrupting the active run or losing an unrelated draft.

## Acceptance Criteria

- Pending steer and follow-up messages are visible in Pi delivery order with text, mode, and bounded attachment treatments.
- Queue state is isolated by thread, follows Pi consumption, and clears when the run becomes inactive.
- Users can edit through the composer, cancel with exact draft restoration, delete an item, and promote a follow-up to steer.
- Successful mutations use Pi-confirmed snapshots; failures preserve recoverable content and the last confirmed queue.
- Keyboard, focus, status announcements, narrow layouts, and theme behavior meet the canonical spec.

## Context Links

- [Queue Editor spec](../../specs/2026-07-13-queue-editor.md)
- [Frontend architecture](../../architecture/frontend.md)
- [Desktop architecture](../../architecture/desktop.md)
- [UI increment map](../../architecture/ui-increments.md)
- [Quality checks](../../quality.md)

## Tickets

### QE-1 — Show the authoritative live queue

**Delivered behavior**

While the selected thread runs, users see its pending steer and follow-up messages above the composer in delivery order. The list stays aligned with Pi as items are added, consumed, selected across threads, or cleared at settlement.

**Acceptance criteria**

- Send during a run creates one visible `Follow up` item; Steer creates one visible `Steer` item.
- Pending items have stable IDs and retain text, mode, and attachments across queue snapshots.
- Cards show text, delivery label, attachment names, bounded image previews, and file treatments without exposing internal paths.
- Selecting another active thread loads only that thread's queue; late responses cannot overwrite the newly selected thread.
- Consumed items disappear and terminal run states clear stale queue presentation.
- Empty text with attachments is accepted; an entirely empty item is rejected.
- The queue is absent when empty, bounded when tall, keyboard reachable, and covered by a deterministic component fixture.

**Validation**

- Agent-host contract tests for append, inspect, stable IDs, order, attachment preservation, consumption, and settlement clearing.
- Frontend state tests for per-thread isolation and stale-response rejection.
- Component tests and Cosmos fixture for modes, attachments, empty state, overflow, keyboard order, and status announcements.
- `bun run typecheck:agent-host`, `bun run typecheck:frontend`, `bun run test:agent-host`, `bun run test:frontend-unit`, and `bun run cosmos:export`.

**Blocked by:** Nothing.

### QE-2 — Edit and manage pending messages

**Delivered behavior**

Users can correct a pending message in the existing composer, cancel without losing their previous draft, delete obsolete work, or promote a follow-up to steer. Each action commits through Pi and handles consumption races safely.

**Acceptance criteria**

- Edit snapshots the current composer text and attachments, loads the selected item, and exposes an unambiguous editing state.
- Sending an edit replaces the same item in place with the same ID and mode, then restores the pre-edit composer snapshot.
- Cancel restores the exact pre-edit composer snapshot without changing the queue.
- Delete removes only the selected pending item; deleting the edited item also restores the pre-edit snapshot.
- A follow-up can be promoted once to steer without changing its ID, position, text, or attachments; steer items do not show a redundant promote action.
- Pi-confirmed snapshots replace local presentation after successful mutations.
- A stale or failed mutation refreshes the queue, preserves edited content as a recoverable draft, reports an actionable error, and does not interrupt the run.
- Focus remains predictable and all edit, cancel, delete, and promote actions work by keyboard at narrow widths.

**Validation**

- Agent-host tests for replace, delete, promote, ordering, stable IDs, invalid input, and stale-item rejection.
- Frontend tests for edit snapshot/restore, replacement versus append, delete-while-editing, failure rollback, and cross-thread races.
- Component and accessibility checks for action visibility, editing state, focus, announcements, attachment previews, and narrow layout.
- Real Tauri smoke covering queue, edit, cancel, delete, promote, Pi consumption order, and uninterrupted execution.
- `bun run check` and `bun run cosmos:export`.

**Blocked by:** QE-1.

## Steps

- [ ] Complete QE-1 and record its validation evidence.
- [ ] Complete QE-2 only after QE-1 is green.
- [ ] Run the final validation lane and move this plan to `completed/`.

## Validation

- Each ticket leaves the app runnable and demonstrates its delivered behavior independently.
- QE-1 establishes the confirmed queue snapshot seam used by QE-2; no speculative queue abstraction or durable app-owned queue is added.
- Final handoff includes focused test results, full check results, Cosmos export, and the desktop smoke outcome.

## Decision Log

- 2026-07-13: Use two vertical slices. Visibility and synchronization are independently demoable; mutation and composer editing share the confirmed snapshot seam and stay together.
- 2026-07-13: No prefactoring ticket. Existing queue operations, composer, attachments, and agent bridge are sufficient seams.
- 2026-07-13: QE-2 is blocked by QE-1 because safe mutation UI depends on stable IDs and authoritative per-thread queue snapshots.
- 2026-07-13: No external tracker copy was published; repository-local execution plans are configured as canonical coordination.

## Progress Log

- 2026-07-13: Drafted ticket breakdown from the approved Queue Editor spec; awaiting granularity and blocker confirmation.
