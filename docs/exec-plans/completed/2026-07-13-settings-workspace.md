# Settings Workspace

## Goal

Expose Pi Ocarina's working hidden configuration through a dedicated, theme-native Settings workspace, then add durable font, color, provider, and notification controls without introducing a parallel design system or interrupting active threads.

## Acceptance Criteria

- Settings opens from the bottom of the app sidebar or `Command+,` and returns to the unchanged app state.
- General, Appearance, Providers, and Notifications expose only working controls.
- Appearance controls drive reusable semantic tokens and durable validated preferences.
- Provider secrets remain write-only, external credentials remain read-only, and existing endpoint validation is preserved.
- Settings is keyboard accessible, reduced-motion safe, responsive, and visually consistent with the current app.

## Context

- [Canonical spec](../../specs/2026-07-13-settings-workspace.md)
- [Frontend architecture](../../architecture/frontend.md)
- [Desktop architecture](../../architecture/desktop.md)
- [UI increment map](../../architecture/ui-increments.md)

## Tickets

### 1. Open a persistent Settings workspace with General controls

**Delivered behavior:** A Settings row pinned below the sidebar's scrollable content and `Command+,` open a dedicated in-window Settings workspace. Back to app restores the mounted workspace/thread view unchanged. General exposes the existing sidebar and supported transparency preferences.

**Acceptance criteria:**

- The Settings row uses the existing sidebar icon column, row highlight, typography, glow, spacing, and focus treatment.
- Settings replaces the visible app content without unmounting the selected workspace, thread runtime, active run, composer draft, transcript scroll, Changes state, or sidebar state.
- The Settings navigator continues beneath the native titlebar and contains Back to app, search, and only sections with implemented content.
- Search matches visible setting labels and descriptions and provides a clear empty state.
- Reusable settings shell, navigator, page, section, and row components live in the settings feature and use existing shared UI primitives.
- Reusable settings layout tokens cover navigator width, content width, row spacing, and preview surfaces; no page-specific color system is introduced.
- General controls persist sidebar visibility and platform-supported transparency through the existing Rust preference command and synchronize across windows.
- `Command+,`, Back to app, section navigation, search, switches, and focus order are keyboard accessible and reduced-motion safe.

**Validation:** Focused navigation/search/state-continuity tests; preference synchronization test; Cosmos shell and General fixtures; frontend/Rust typechecks; production build; Tauri smoke opening Settings during an active or preserved thread.

**Blocked by:** None.

### 2. Choose system Application and Code fonts

**Delivered behavior:** Appearance lets users preview and persist one operating-system font for application/prose roles and one for code/heading/composer/editor roles, with the current Pi Ocarina stacks as defaults and safe fallback when a font disappears.

**Acceptance criteria:**

- A narrow native command returns system font family names only; paths, font files, and binary content never enter the webview.
- Font results are bounded, deduplicated, sorted, runtime-validated, and degrade to the bundled/default stacks when discovery is unavailable.
- Application font drives shared UI, button, and prose variables. Code font drives mono, heading, composer, code, editor, diff, and tool-call variables.
- Components with hardcoded font families are migrated to the existing semantic typography variables required for global selection; no component-local preference reads are added.
- Font menus provide search, render available family names in-family, and show a representative preview before selection.
- Preview is immediate. Selection persists atomically, synchronizes across windows, survives restart, and safely normalizes missing or invalid persisted families.
- Reset fonts restores the exact current default stacks.
- Compact UI, transcript, composer, tool calls, code blocks, diff editor, menus, and Settings remain legible without clipping at supported zoom levels.

**Validation:** Native font-contract tests; preference migration/normalization tests; typography-token mapping and fallback tests; Cosmos available/missing/error font fixtures; visual smoke across compact and prose surfaces; strict typechecks, Rust checks, and production build.

**Blocked by:** Ticket 1.

### 3. Tune accent, background brightness, and project palette

**Delivered behavior:** Appearance previews and persists a global interface accent, one bounded dark-background brightness control, and an editable ordered project palette while preserving accessible semantic colors and stable workspace color assignment.

**Acceptance criteria:**

- One normalized appearance preference object is the source for both live preview and restored theme state.
- Global accent applies outside workspace-scoped project color contexts; project-scoped accents still resolve from the palette.
- Background brightness derives background, noisy/sidebar/composer surface, raised surface, popover, terminal, border, noise, and matrix-shadow roles from one bounded input while retaining their relative hierarchy.
- Foreground, semantic status, and diff colors remain controlled and meet the established contrast floor across the full brightness range.
- Each project palette slot supports native color input plus validated hex text and previews representative workspace/sidebar usage.
- Stable hashing continues assigning workspaces to ordered palette slots. Editing a slot updates assigned workspace colors without changing workspace identity, order, or stored per-workspace records.
- Slider and color previews update immediately; durable writes are coalesced and flush on release, blur, Back to app, and window close.
- Reset colors and Reset appearance restore existing defaults without affecting provider, notification, workspace, or thread state.
- Invalid persisted colors, palette length, or brightness normalize safely and surface one bounded settings error.

**Validation:** Theme derivation, contrast, palette validation, stable assignment, reset, coalescing, migration, and cross-window tests; Cosmos brightness/palette/error fixtures; visual smoke of sidebar, composer, transcript, overlays, tools, and Changes; strict typechecks, Rust checks, and production build.

**Blocked by:** Ticket 2.

### 4. Configure providers, endpoints, and default model scope

**Delivered behavior:** Providers composes the existing live Pi catalog, credential writes, model scope/selection, catalog errors, and OpenAI-compatible endpoint management into the Settings workspace without interrupting the current thread.

**Acceptance criteria:**

- The page displays configured, unconfigured, stored, and externally managed provider states from the existing Pi catalog.
- API-key replacement remains write-only: saved values never return to inputs, app state, logs, events, or error text.
- Externally managed credentials are read-only and identify their source without exposing values.
- Global/repository scope and default-model selection reuse existing commands; repository scope names the current workspace.
- Changing defaults does not silently replace the model already attached to an active thread.
- Custom endpoint add/edit/remove reuses current validation for identifiers, HTTPS/localhost, credential references, and model identifiers.
- Provider, credential, endpoint, and catalog errors render inline beside the responsible control and remain actionable.
- Catalog refresh and Settings navigation do not cancel or restart an active agent run.

**Validation:** Existing agent-host provider/endpoint suites plus focused Settings composition, secret non-disclosure, model-scope, active-thread isolation, and error-state tests; Cosmos provider permutations and endpoint fixtures; frontend/agent-host typechecks and Tauri smoke.

**Blocked by:** Ticket 1.

### 5. Configure notifications and complete Settings integration

**Delivered behavior:** Notifications exposes existing completed, failed, and attention preferences alongside the actual macOS permission state. The completed four-section Settings workspace passes accessibility, persistence, and desktop integration checks.

**Acceptance criteria:**

- Completed, failed, and attention use accessible switches backed by the existing notification policy.
- Permission state clearly renders allowed, not requested, or denied independently of category preferences.
- Not requested invokes the native permission request; denied opens macOS System Settings; allowed requires no redundant action.
- Category preferences survive restart and synchronize where currently global without pretending to change macOS permission.
- All four final sections participate in search, keyboard navigation, selected-state styling, responsive row layout, and Settings landmarks/headings.
- Settings remains usable at supported zoom and narrow window widths; labels, descriptions, validation, and controls do not overlap.
- Full reduced-motion, focus, contrast, runtime-validation, preference migration, cross-window, Cosmos, production, and Tauri checks pass.
- Opening and leaving any Settings section preserves the active thread, run, draft, scroll position, Changes state, and selected workspace.

**Validation:** Notification policy/permission tests; full Settings search/navigation/state-continuity and accessibility checks; complete Cosmos export; lint, strict typechecks, frontend/agent-host/Rust tests, production build, and real Tauri restart/persistence smoke.

**Blocked by:** Tickets 1, 2, 3, and 4.

## Validation

- Complete each ticket's focused checks before unblocking dependents.
- After Ticket 5, run the repository quality suite, Cosmos export, Sonata/context checks, production build, and real Tauri smoke.
- Visually verify every selectable font across sidebar, composer, transcript, tool calls, editor/diff, menus, and Settings before declaring typography complete.
- Verify provider-backed settings with stored and externally managed credentials without exposing secret values in captured evidence.

## Decision Log

- 2026-07-13: Use five vertical slices; the Settings shell and General page establish real reusable seams, so no prefactoring ticket is needed.
- 2026-07-13: Settings sections appear only when their working page lands; no placeholder categories.
- 2026-07-13: Typography and color Appearance work are separate contexts because native font discovery and theme derivation have different risk and validation seams.
- 2026-07-13: Providers may proceed after the shell independently of Appearance; final Notifications integration waits for all prior Settings sections.
- 2026-07-13: Repo-local execution plan only; no external tracker publishing was requested.

## Progress Log

- [x] Ticket 1: Settings workspace shell and General controls.
- [x] Ticket 2: System Application and Code fonts.
- [x] Ticket 3: Accent, brightness, and project palette.
- [x] Ticket 4: Providers, endpoints, and model scope.
- [x] Ticket 5: Notifications and final integration.

- 2026-07-13: Approved Settings spec split into five blocker-aware tracer bullets.
- 2026-07-13: Implemented the persistent Settings shell, global search, General controls, native system fonts, semantic typography overrides, derived dark surfaces, project palette editing, single-watcher provider settings, model defaults, custom endpoints, and notification controls.
- 2026-07-13: Focused frontend, agent-host, Rust, theme, palette, notification, and font tests pass. Cosmos visual QA/export, production build, lint/typechecks, Rust fmt/clippy/test/build, Sonata/context checks, diff check, and six real Tauri E2E flows pass.
