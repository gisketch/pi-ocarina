# Skills and Extensions Manager

## Goal

Expose Pi-owned workspace skills and extensions through one searchable Resources view where users can inspect, reveal, try, and safely enable or disable manageable resources without interrupting active work or creating duplicate state.

## Acceptance Criteria

- The selected workspace exposes a dedicated Resources view that preserves the mounted application state.
- Skills and extensions use workspace discovery before a thread exists and display bounded, searchable metadata and diagnostics.
- Safe local paths can be revealed; a skill can be placed into the preserved composer without submission.
- Manageable user/project resources persist enabled state through Pi settings; immutable resources remain visibly read-only.
- Active runs are never interrupted by a resource reload, and composer discovery reconciles after confirmed changes.

## Context Links

- [Canonical spec](../../specs/2026-07-13-skills-extensions-manager.md)
- [Frontend architecture](../../architecture/frontend.md)
- [Desktop architecture](../../architecture/desktop.md)
- [UI increment map](../../architecture/ui-increments.md)
- [Quality checks](../../quality.md)

## Tickets

### SEM-1 — Browse and Try Workspace Skills

**Delivered behavior**

The selected workspace opens a dedicated Resources view that lists and searches discovered skills, shows one skill's bounded details, refreshes discovery, reveals safe local folders, and returns a canonical skill invocation to the preserved composer through `Try`.

**Acceptance criteria**

- `Manage Resources` appears in selected-workspace contextual actions and opens Resources without unmounting the workspace/thread runtime.
- Back to app preserves thread selection, active run, draft and attachments, transcript scroll, Changes state, and invoking-control focus.
- Switching workspaces replaces the catalog without displaying stale results from the previous workspace.
- Skill search matches name, description, aliases, source, scope, path, availability, policy, and bounded diagnostics case-insensitively.
- Selection remains stable when possible and otherwise moves deterministically to the first filtered skill.
- Loading, empty, no-match, unavailable, read-only, and error states are distinct and accessible.
- Refresh uses workspace discovery before a thread exists and does not interrupt an active run.
- Reveal crosses the existing narrow native boundary and rejects paths outside approved workspace or Pi user-resource roots.
- `Try` returns to the previous composer and inserts the canonical invocation without submitting or replacing the existing draft.
- Narrow layout, keyboard navigation, focus restoration, selectable paths, and text-labeled status remain usable.

**Validation**

- Host/contract tests for bounded skill metadata, diagnostics, deterministic discovery, malformed responses, and no file contents or executable objects.
- Rust tests for accepted workspace/user resource roots and rejected unsafe reveal paths.
- Frontend tests for entry/back continuity, workspace race rejection, filtering, stable selection, refresh, states, focus, and draft-preserving `Try`.
- Component fixtures for populated, loading, empty, filtered, unavailable, read-only, error, and narrow layouts.
- `bun run typecheck`, `bun run test:frontend-unit`, `bun run test:agent-host`, `bun run rust:test`, and `bun run cosmos:export`.

**Blocked by:** None.

### SEM-2 — Manage Skill Availability Through Pi

**Delivered behavior**

Manageable user/project skills can be enabled or disabled through Pi settings. Confirmed changes update discovery and composer suggestions, while bundled, temporary, and externally managed skills remain read-only.

**Acceptance criteria**

- Manageability comes from Pi resource/settings metadata, never path-shape guesses.
- Enable/disable changes only the targeted Pi user/project setting and preserves unrelated packages, paths, and resource settings.
- Skill files are never rewritten, moved, or deleted.
- Confirmed changes refresh the catalog and remove or restore the skill in composer suggestions and model discovery.
- An active run continues with its current capabilities; the manager shows pending state and reloads the affected runtime only after settlement.
- Persistence or reload failure restores the last confirmed presentation and shows an actionable error.
- Restart preserves the confirmed state; immutable sources never expose a toggle.

**Validation**

- Host tests for user/project settings forms, targeted mutation, unrelated-entry preservation, persistence failure, and reload failure.
- Runtime tests for disable, re-enable, deferred active-run reload, and composer/resource reconciliation.
- Frontend tests for read-only labeling, pending/confirmed/failed states, duplicate-action prevention, and rollback.
- `bun run typecheck`, `bun run test:frontend-unit`, `bun run test:agent-host`, and `bun run build`.

**Blocked by:** SEM-1.

### SEM-3 — Inspect and Manage Extensions

**Delivered behavior**

Resources gains an Extensions section with search, contribution and diagnostic details, compatibility status, safe reveal, and Pi-backed enable/disable behavior that reconciles composer commands and mentions without disrupting active runs.

**Acceptance criteria**

- Skills and Extensions are separate keyboard-reachable sections in the same Resources view; no permanent application column is added.
- Extension search covers display name, source, scope, origin, path, commands, tools, flags, shortcuts, compatibility, and bounded diagnostics.
- List rows show enabled state plus contribution and diagnostic counts; details show explicit empty contribution groups.
- Reveal appears only for validated local paths.
- Only Pi-managed user/project package or path entries expose enable/disable; immutable sources are labeled read-only.
- Toggle persistence preserves Pi's existing package/path representation and unrelated settings.
- Confirmed changes refresh extension discovery plus composer commands and mentions without restarting the app.
- During an active run, the setting persists and appears pending, but runtime unload/reload waits until settlement.
- Mutation or reload failure retains the last confirmed state and exposes an actionable error.
- Switching workspace, refreshing, filtering, and narrow layout retain the shared manager's continuity and accessibility behavior.

**Validation**

- Host/contract tests for bounded extension metadata, contributions, diagnostics, compatibility, package/path settings forms, and targeted persistence.
- Runtime tests for disable/re-enable, composer command/mention reconciliation, active-run deferral, and failure rollback.
- Frontend tests for section navigation, search, stable selection, contribution states, manageability, pending state, and errors.
- Component fixtures for populated, empty, diagnostic, incompatible, read-only, pending, failed, and narrow layouts.
- Real Tauri smoke for reveal, toggle, active-run continuity, composer reconciliation, and persistence after restart.
- `bun run check`, `bun run cosmos:export`, and `bun run test:e2e`.

**Blocked by:** SEM-1.

## Steps

- [ ] Complete SEM-1.
- [ ] Complete SEM-2 after SEM-1.
- [ ] Complete SEM-3 after SEM-1; it does not depend on SEM-2.
- [ ] Run final cross-resource validation and move this plan to completed.

## Validation

- Each ticket leaves its focused checks green before dependent work begins.
- Final lane: `bun run check`, `bun run cosmos:export`, and `bun run test:e2e`.
- Manual smoke: open Resources before creating a thread, search/reveal/try a skill, toggle each manageable resource kind, verify an active run continues, confirm composer discovery updates after settlement, switch workspaces, return to the preserved conversation, and restart.

## Decision Log

- 2026-07-13: Use three vertical tickets; no prefactor ticket is needed because workspace discovery, reveal, reload, composer integration, compatibility records, and extension toggles already exist.
- 2026-07-13: Establish the preserved Resources view with a complete Skills browsing flow before adding mutation behavior.
- 2026-07-13: Skill availability and extension management both depend on the Resources view but not on each other.
- 2026-07-13: Marketplace, installation, file editing, and resource creation remain outside this plan.
- 2026-07-13: The repository-local plan is canonical; external tracker publication was not requested.

## Progress Log

- 2026-07-13: Spec approved and three-ticket breakdown drafted. No implementation started.
