# Skills and Extensions Manager

## Problem and Desired Outcome

Pi Ocarina discovers workspace and user skills and extensions, exposes them to the composer, and already has hidden resource controls. Users cannot inspect that runtime clearly, search it, understand why a resource is unavailable, or safely manage supported resource state.

Add one workspace-scoped Resources manager with Skills and Extensions sections. It must expose Pi-owned discovery and settings without creating a second resource registry or interrupting active work.

## In Scope

- A discoverable `Manage Resources` action for the selected workspace.
- A dedicated in-window Resources view with Back to app, Skills and Extensions navigation, search, refresh, list, selection, details, empty, loading, and error states.
- Skill metadata: name, description, invocation aliases, source, scope, path, availability, and model-invocation policy.
- Skill actions: reveal its folder, enable or disable manageable user/project skills, and place an invocation in the composer through `Try`.
- Extension metadata: display name, source, scope, origin, path, enabled state, commands, tools, flags, shortcuts, compatibility status, and diagnostics.
- Extension actions: reveal its folder and enable or disable manageable user/project extensions.
- Workspace resource discovery before a thread exists and live reconciliation after refresh or a successful mutation.
- Pi settings as the durable source of truth for enabled state.

## Out of Scope

- A marketplace, package browser, remote search, download, install, update, or uninstall workflow.
- Creating or editing skill or extension files inside Pi Ocarina.
- Executing extension-provided React or terminal renderers in the manager.
- Editing commands, tools, flags, shortcuts, package declarations, or diagnostics.
- Global resource management without a selected workspace.
- A second resource database, copied manifest, or app-owned enabled-state store.

## Acceptance Criteria

### Entry and Continuity

- `Manage Resources` is available from the selected workspace's contextual actions and opens the manager for that workspace.
- Opening or closing Resources preserves the selected thread, active run, composer draft and attachments, transcript scroll position, Changes state, and workspace selection.
- Back to app restores the exact application view that opened Resources.
- Switching workspaces while Resources is open replaces the catalog with that workspace's resources and never mixes results from two workspaces.
- With no selected workspace, the view explains that a workspace is required and offers the existing open-workspace action.

### Shared Manager Behavior

- Skills and Extensions are separate keyboard-reachable sections within one Resources view; no additional permanent application column is introduced.
- Each section shows a searchable list and one selected detail pane. Search matches visible identity, description, source, scope, aliases or contributions, path, and diagnostics as applicable.
- Search is case-insensitive, trims surrounding whitespace, preserves deterministic discovery order, and shows a clear no-results state.
- The first filtered item becomes selected when the previous selection is no longer visible. Selection remains stable across refresh when its resource still exists.
- Refresh re-runs Pi workspace resource discovery, reports bounded diagnostics, and does not end an active run or discard local UI state.
- Loading, empty, unavailable, read-only, success, and failure states are represented with text, not color alone.

### Skills

- Every discovered skill shows its name, description, invocation alias, source/scope, and enabled or unavailable state in the list.
- The detail pane shows the canonical path, all aliases, whether the model may invoke it, and any discovery diagnostic associated with it.
- `Reveal` uses the existing narrow native reveal boundary and rejects paths outside the selected workspace or Pi-owned user resource locations.
- `Try` returns to the preserved composer and inserts the skill's canonical invocation without submitting it or replacing existing draft text.
- Enable/disable is shown only when Pi settings can manage that user/project skill. Bundled, temporary, externally managed, or otherwise immutable skills are labeled read-only.
- Disabling a skill removes it from model discovery and composer suggestions after the applicable runtime refresh. Re-enabling restores it without changing its files.

### Extensions

- Every discovered or configured extension shows its display name, source/scope, enabled state, contribution counts, and diagnostic count in the list.
- The detail pane shows origin and path plus commands, tools, flags, shortcuts, command compatibility, and diagnostics. Empty contribution groups remain explicit.
- `Reveal` is available only for extensions with a safe local path.
- Enable/disable is shown only for user/project entries managed by Pi settings. Package and path settings retain their existing Pi representation.
- A successful toggle persists through Pi settings, refreshes the resource catalog, and updates composer commands and mentions without restarting the application.
- Extension mutation never unloads code during an active run. If a run is active, the manager persists the choice, labels it as pending, and applies the runtime reload after that run settles.
- Failed persistence or reload leaves the last confirmed state visible and presents an actionable error; optimistic state never becomes authoritative.

### Accessibility and Layout

- The Resources view reuses the application's semantic theme, typography, buttons, inputs, badges, scroll areas, and focus treatment.
- List selection, section navigation, search, refresh, reveal, try, and toggles are operable by keyboard and have accessible names.
- Narrow layouts stack list and detail content without horizontal page scrolling; long paths and diagnostic text remain selectable and readable.
- Focus moves to the Resources heading on entry, remains predictable after refresh, and returns to the invoking control on exit when it still exists.

## Implementation Constraints and Settled Decisions

- Resources is a dedicated application view, not Settings, a modal, or a native window.
- The existing mounted workspace/thread runtime remains alive behind the view, following the same continuity pattern as Settings.
- Workspace resource discovery is the public seam for the manager; a thread snapshot is not required to render it.
- Pi resource loaders and Pi settings remain authoritative. React owns only query, section, selection, and pending presentation state.
- Extend the current bounded resource records only with metadata the UI displays. Do not send executable extension objects, credential values, file contents, or unbounded diagnostic payloads across the host boundary.
- Skill and extension mutations cross typed host operations. Native filesystem access remains limited to reveal actions.
- Existing resource reload, extension compatibility, composer suggestion, and reveal behavior must be reused rather than reimplemented.
- One Resources view owns both resource kinds because their entry, search, refresh, source/scope vocabulary, and continuity behavior are shared; their mutation rules remain type-specific.

## Validation Evidence

- Resource contract tests prove workspace-scoped discovery, bounded metadata and diagnostics, deterministic ordering, and rejection of malformed host responses.
- Settings integration tests prove manageable skill and extension toggles persist in Pi's existing user/project settings without rewriting unrelated entries.
- Runtime tests prove disabled resources disappear after reload, enabled resources return, active runs are not interrupted, and deferred reload applies after settlement.
- Frontend tests prove entry/back continuity, workspace switching, search, stable selection, empty/error states, `Try` draft insertion, and confirmed-state rollback after mutation failure.
- Security tests prove reveal rejects unsafe paths and resource payloads contain no file contents, executable objects, or credential values.
- Component fixtures cover populated, empty, loading, filtered, read-only, unavailable, diagnostic, pending, and narrow-layout states for both sections.
- Accessibility checks cover landmarks, headings, list/detail semantics, labels, focus order, keyboard operation, contrast, zoom, and reduced motion.
- Strict typechecks, focused host/frontend/Rust tests, production build, and one real Tauri smoke verify discovery, reveal, toggle, refresh, `Try`, persistence after restart, and continuity during an active run.

## Risks and Open Questions

- Pi resource settings can represent packages, paths, scopes, and external sources differently. Manageability must be derived from Pi metadata rather than guessed from path shape.
- Reloading extensions can change commands and tools. Deferring runtime reload during an active run prevents mid-run capability drift.
- Diagnostics and contribution lists can be large. Payloads and rendering must remain bounded without hiding the resource-level error summary.
- No product decision remains open for the first manager slice.
