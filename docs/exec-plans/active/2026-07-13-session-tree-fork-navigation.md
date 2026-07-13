# Session Tree and Fork Navigation

## Goal

Expose Pi's existing session-tree operations through a searchable, accessible browser that can switch branches or fork an assistant response into a separate same-workspace thread.

## Acceptance Criteria

- The active conversation exposes a Session tree action with correct unavailable states.
- Users can search, expand, collapse, and keyboard-navigate bounded Pi tree entries while retaining current conversation state.
- Users can switch branches with no summary or Pi's standard summary and recover returned editor text.
- Users can fork an assistant response into one persistent sidebar thread without changing the source thread.
- Loading, cancellation, read-only, non-persistent-session, and failure states remain truthful and create no phantom UI state.

## Context Links

- [Canonical spec](../../specs/2026-07-13-session-tree-fork-navigation.md)
- [Desktop architecture](../../architecture/desktop.md)
- [UI increment map](../../architecture/ui-increments.md)
- [Quality checks](../../quality.md)

## Tickets

### STFN-1 — Expose a Searchable Session Tree

**Delivered behavior**

An active thread opens a polished Session tree modal from the conversation toolbar. The modal loads bounded Pi entries, identifies the active path, and supports search, branch disclosure, keyboard navigation, retry, and accessible focus behavior without changing conversation state.

**Acceptance criteria**

- The visible action is unavailable with no thread, during a run, or for a newer-schema read-only session.
- Opening and closing preserves thread selection, draft, transcript scroll, sidebar, and Changes layout.
- Loading, retryable error, empty-tree, and no-search-match states are distinct.
- The active path starts expanded and the active leaf is brought into view and labeled beyond color.
- Search matches role, type, and preview while retaining matching ancestors.
- Pointer and Up/Down/Left/Right/Enter/Escape behavior is deterministic; focus is trapped and restored.

**Validation**

- Focused frontend tests for flattening, active-path expansion, filtering, disclosure, and keyboard selection.
- Agent-host contract assertion for bounded tree identity, parentage, roles, previews, and active leaf.
- Cosmos fixture for loading, error, branched, selected, and empty states.
- `bun run typecheck`, `bun run test:frontend-unit`, `bun run test:agent-host`, and `bun run cosmos:export`.

**Blocked by:** None.

### STFN-2 — Navigate Branches Safely

**Delivered behavior**

Selecting a non-current tree entry offers immediate navigation or Pi's standard abandoned-branch summary, then refreshes the conversation from Pi and restores returned user-prompt text to the composer.

**Acceptance criteria**

- Continuing from the current leaf is a no-op labeled “Already here.”
- A non-current selection offers No summary and Summarize choices before mutation.
- Busy state blocks duplicate submission and dismissal; supported cancellation reaches Pi.
- Success replaces the visible snapshot, clears stale stream state, restores returned editor text, and closes the modal.
- Failure or cancellation leaves the destination unclaimed and shows an actionable modal error.

**Validation**

- Agent-host tests for navigation with and without summary, editor-text return, cancellation, and running-session rejection.
- Frontend tests for current-leaf no-op, summary selection, busy state, success refresh, and failure retention.
- `bun run typecheck`, `bun run test:frontend-unit`, `bun run test:agent-host`, and `bun run build`.

**Blocked by:** STFN-1.

### STFN-3 — Fork an Assistant Response

**Delivered behavior**

An assistant entry can be confirmed as the endpoint of a new persistent Pi thread in the same workspace. The fork becomes selected and appears once in the sidebar; the source remains intact.

**Acceptance criteria**

- Only supported assistant entries expose Fork.
- Confirmation explains source preservation and shows a bounded response preview.
- Forking is unavailable while running, for newer-schema sessions, and for non-persistent sources.
- Success creates one leased Pi session through the selected response, refreshes the sidebar, selects the fork, and starts with an empty composer.
- Failure retains the source selection and creates no phantom sidebar entry.
- Both source and fork reopen correctly after restart.

**Validation**

- Agent-host tests for branched-session contents, distinct identity, lease acquisition, and invalid-source rejection.
- Frontend/integration tests for fork eligibility, confirmation, single sidebar insertion, selection, empty draft, and rollback on failure.
- Real Tauri smoke covering fork, source return, and restart recovery.
- `bun run check` and `bun run test:e2e`.

**Blocked by:** STFN-1.

## Steps

- [ ] Complete STFN-1.
- [ ] Complete STFN-2 after STFN-1.
- [ ] Complete STFN-3 after STFN-1; it does not depend on branch navigation.
- [ ] Run final cross-feature validation and move this plan to completed.

## Validation

- Each ticket leaves its focused checks green before dependent work begins.
- Final lane: `bun run check`, `bun run cosmos:export`, and `bun run test:e2e`.
- Manual smoke: browse a branched session, search, switch with both summary modes, restore a user prompt, fork an assistant response, return to the source, and restart.

## Decision Log

- 2026-07-13: Use three vertical tickets; no prefactor ticket is needed because typed host operations and a hidden basic UI already exist.
- 2026-07-13: Branch navigation and same-workspace fork both depend on the tree browser but not on each other.
- 2026-07-13: Worktree forks, custom summary prompts, and transcript-level fork controls remain outside this plan.
- 2026-07-13: The repository-local plan is canonical; no external tracker is configured for automatic publication.

## Progress Log

- 2026-07-13: Spec approved and ticket breakdown drafted. No implementation started.
