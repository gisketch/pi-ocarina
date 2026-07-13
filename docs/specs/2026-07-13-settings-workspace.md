# Settings Workspace

## Problem and Desired Outcome

Pi Ocarina already implements provider credentials, custom endpoints, appearance preferences, notifications, and other controls, but most entry points are hidden. Users cannot configure the app without relying on external Pi files or code-level defaults.

Add a theme-native Settings workspace entered from the bottom of the main sidebar. It should follow the reference layout—a compact settings navigator beside a focused content pane—while retaining Pi Ocarina's pixel-grid, noise, typography, spacing, hover, glow, and motion identity. Settings must reuse the same tokens and shared controls as the rest of the application rather than becoming a second visual system.

## In Scope

- A Settings button pinned to the bottom of the application sidebar, below the scrollable workspace/thread list.
- `Command+,` as the standard keyboard entry point.
- A dedicated in-window Settings workspace with Back to app, search, section navigation, and a scrollable content pane.
- Initial sections: General, Appearance, Providers, and Notifications.
- General controls for existing application behavior such as sidebar visibility and supported transparency.
- Appearance controls for application and code fonts, interface accent, background brightness, and the project color palette.
- Provider credentials, externally managed provider status, default model scope/selection, catalog errors, and OpenAI-compatible custom endpoints.
- Existing notification categories, macOS permission state, permission request, and system-settings recovery.
- Durable, validated preferences shared across windows where the setting is global.
- Reusable settings layout, row, section, swatch, preview, and form-control styling built on existing shared UI and theme tokens.

## Out of Scope

- Light theme or automatic light/dark switching. The shipped theme remains dark.
- Codex categories Pi Ocarina does not support, including profile, billing, voice, pets, browser, hooks, connections, or account management.
- A marketplace for fonts, themes, providers, skills, or extensions.
- Downloading or bundling arbitrary system fonts.
- Editing semantic success, warning, danger, or diff colors independently; these retain accessible product defaults.
- Import/export or sharing of theme files in the first slice.
- Moving terminal, resources, session tree, extension dock, or queue management into Settings.

## Acceptance Criteria

### Entry, Navigation, and Continuity

- The Settings row stays visible at the bottom of the expanded main sidebar and uses the same icon column, row hover, glow, typography, and alignment as other sidebar actions.
- Activating Settings or pressing `Command+,` opens the Settings workspace without ending an active run, discarding a composer draft, changing the selected thread, or losing transcript scroll position.
- Back to app restores the exact application view that was present before Settings opened.
- The Settings surface preserves the macOS overlay titlebar and traffic-light spacing. Its left navigator visually continues through the titlebar like the main sidebar.
- Search filters settings sections and matching rows by visible label and supporting description. Clearing search restores normal section navigation.
- General, Appearance, Providers, and Notifications are keyboard reachable, expose a clear selected state, and retain focus visibility.

### Shared Settings UI

- Settings pages use one shared shell and repeatable section/row pattern: label and optional description on the left, compact control on the right, with narrow layouts stacking the control below.
- Existing Button, Input, Select/Dropdown, Tabs where appropriate, Switch, Slider, Tooltip, and form-validation behavior are reused before adding a new primitive.
- Any new settings-specific tokens describe reusable roles—settings navigation width, content width, row spacing, preview surface—not individual page values.
- Settings previews consume the same live theme variables as the application. No preview or settings component maintains a parallel hardcoded theme.
- Destructive or security-sensitive actions remain explicitly labeled and are never represented by color alone.

### Appearance

- Appearance changes preview live across the Settings workspace and the preserved application view, then persist through the existing Rust-owned preferences store.
- An Application font control selects from fonts available to the operating system and maps the shared UI, button, and prose typography roles together.
- A Code font control selects from fonts available to the operating system and maps the shared mono, heading, composer, inline-code, code-block, editor, and tool-call typography roles together.
- The current Pi Ocarina font stack remains the default. Missing fonts after a system change fall back to the stored fallback stack without making text invisible or blocking startup.
- Font menus show each family name rendered in that family when available and provide a representative preview before selection.
- Interface accent changes the global default accent used outside a workspace-specific project scope. Workspace-scoped accents continue to come from the project palette.
- Background brightness adjusts one bounded luminance input from darker to lighter. The background, sidebar/composer noisy surface, raised surfaces, popovers, terminal, and matrix-shadow treatment derive from it while preserving their relative hierarchy.
- Brightness cannot produce unreadable foreground/background or border contrast. Foreground and semantic colors remain controlled by accessible theme derivation rather than free-form per-element editing.
- The project palette editor displays every project color slot, supports editing each slot with native color input plus validated hex text, and previews the resulting sidebar/workspace identity.
- Stable workspace hashing continues to choose a palette slot. Editing a slot changes the displayed color of workspaces assigned to that slot without changing workspace identity or order.
- Appearance offers Reset fonts, Reset colors, and Reset appearance actions with the existing defaults clearly previewed before reset.

### Providers and Models

- The Providers page reuses the existing Pi model catalog as its source of truth and shows configured, unconfigured, stored, and externally managed providers accurately.
- Stored API keys may be replaced but are never read back into the webview, logs, settings state, or visible inputs.
- Externally managed credentials are read-only and identify their source without exposing credential values.
- Provider save errors and catalog errors appear inline near the relevant control and remain actionable.
- Users can choose the existing global or repository model scope and an available default model. A repository-scoped choice clearly identifies the current workspace.
- Users can add, edit, and remove existing OpenAI-compatible custom endpoints with the current HTTPS, localhost, identifier, credential-reference, and model validation preserved.
- Provider/catalog refresh does not interrupt an active thread or silently replace that thread's already selected model.

### Notifications

- The Notifications page exposes the existing completed, failed, and attention categories with accessible switches.
- macOS permission state is visible as allowed, not requested, or denied.
- Not-requested permission offers the native permission request. Denied permission offers Open System Settings.
- Notification preference changes persist independently from macOS permission state and continue using the existing notification policy.

### Persistence and Failure Behavior

- Appearance and general settings use the Rust-owned, atomically persisted preference state and synchronize to every open window through the existing app-state event.
- Rapid slider and color input is previewed immediately but durable writes are coalesced; blur, pointer release, Back to app, and window close flush the latest value.
- Invalid persisted font, color, palette, or brightness values fall back safely and surface a bounded settings error instead of breaking application rendering.
- Existing preference files migrate with defaults for every new field. Future-schema handling remains fail-closed.

## Implementation Constraints and Settled Decisions

- Settings is an application view, not a modal and not a new native window.
- Opening Settings changes presentation only; the mounted workspace/thread runtime remains alive beneath the view.
- The first release has four sections only. Add another section only when it owns visible, working controls.
- Dark mode remains the only theme. Background brightness is a dark-theme luminance adjustment, not a hidden light-theme implementation.
- Font customization exposes two user-facing roles—Application and Code—while continuing to drive the existing lower-level typography variables. Components must consume shared typography variables rather than storing font-family overrides.
- System-font discovery crosses a narrow native boundary and returns family names only. Font files, paths, and binary data do not enter the webview.
- Theme derivation begins from a small persisted appearance preference object and writes resolved CSS custom properties at the document root. Components continue consuming semantic tokens.
- Project palette entries persist as ordered color slots. Stable hashing remains the assignment mechanism; no per-workspace color database is introduced in this slice.
- Existing provider, endpoint, model-scope, notification, and appearance capabilities are composed into Settings rather than reimplemented.
- Preview state and durable state share one normalization function so reload cannot produce a different theme from the preview.

## Validation Evidence

- Settings navigation tests prove sidebar entry, `Command+,`, Back to app, search, keyboard navigation, and preservation of thread/draft/run state.
- Preference contract and Rust migration tests prove defaults, validation, atomic persistence, cross-window synchronization, and future-schema behavior.
- Appearance tests prove font-role mapping, missing-font fallback, brightness bounds, derived surface hierarchy, palette validation, stable workspace-slot assignment, resets, and coalesced persistence.
- Provider integration tests prove secret values never return, external credentials stay read-only, scope/model selection persists, endpoint validation remains enforced, and errors render inline.
- Notification tests prove category persistence and all macOS permission states.
- Cosmos fixtures cover the settings shell, navigation/search, setting rows, appearance previews, font selectors, palette editor, provider states, endpoint form, errors, and notification states.
- Accessibility checks cover landmarks, headings, labels/descriptions, switches/sliders, focus order, keyboard activation, contrast, zoom, and reduced motion.
- Strict typechecks, focused frontend/Rust tests, production build, Cosmos export, and a real Tauri smoke verify opening Settings, changing appearance, returning to an unchanged active thread, and persistence after restart.

## Risks and Open Questions

- System font enumeration and name availability vary by platform. The native contract must stay platform-neutral and always retain generic fallback families.
- Global font replacement can change metrics and expose clipping in compact controls. Visual checks must cover the sidebar, composer, transcript, tool calls, diff editor, menus, and Settings itself.
- Background brightness must not independently shift every color. One derivation seam is required to prevent token drift and inaccessible combinations.
- No product decision remains open for the first Settings slice.
