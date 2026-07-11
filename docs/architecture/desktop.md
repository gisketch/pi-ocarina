# Desktop Architecture

## Decision

Use Tauri 2 as the desktop shell. Keep three runtime boundaries:

1. React webview renders UI and owns temporary view state.
2. Rust owns trusted native capabilities and process supervision.
3. A JavaScript agent host owns the Pi SDK integration.

The agent host exists because the Pi SDK is JavaScript while the trusted Tauri host is Rust. It is a narrow adapter, not a second backend.

## Tauri Contract

- Group commands by capability: workspace, session, git, terminal, settings, notification.
- Commands accept and return serializable request/response data.
- Long-running work starts with a command and streams typed lifecycle events.
- React never receives unrestricted shell, filesystem, or process handles.
- Tauri capabilities grant only the paths and actions required by shipped features.

## Agent Host Contract

- Rust starts, monitors, and stops the host.
- Use one explicit request/event protocol over stdio unless a measured need proves another transport.
- Each message carries a protocol version, request id, operation, and payload.
- Protocol version 1 is newline-delimited JSON. Host events are `started`, `completed`, `cancelled`, or `failed`; each request emits at most one terminal event.
- Validate untrusted process messages on both sides of the boundary.
- The host adapts Pi SDK calls and events; it does not reinterpret Pi session semantics.
- A host crash must fail the active run clearly without corrupting existing sessions.
- The host runtime is pinned with the Pi dependency and invoked by absolute bundled-resource path in production; `PATH` is not a runtime dependency.
- `bun run package:macos` stages the pinned host dependencies and produces an unsigned local `.app`; credentials and Pi user resources stay in their normal home-directory locations.

## Session Rule

Pi-owned session files are authoritative. The app may keep workspace metadata, UI preferences, archive flags, and rebuildable indexes, but must not maintain a competing transcript database.

Never delete or rewrite user sessions, worktrees, credentials, or repositories without explicit confirmation.

## App State

- Rust persists only workspace metadata, selections, preferences, and per-window projections in `app-state.json`.
- Writes replace the primary file atomically and retain the last valid primary as `app-state.json.bak`.
- Startup reports whether state was new, loaded, migrated, or recovered from backup; unsupported future schemas fail closed.
- Rust broadcasts immutable snapshots to window consumers. Renderers never own or replace durable state.

## `pi-gui` Translation Map

| `../pi-gui` responsibility | pi-ocarina owner |
|---|---|
| Electron renderer | React feature slices |
| Preload typed IPC | Tauri command/event modules |
| Electron main process | Rust services and commands |
| `pi-sdk-driver` | JavaScript agent host adapter |
| JSONL sessions | Pi-owned authoritative sessions |
| Electron builder/native helpers | Tauri build, plugins, and narrowly scoped Rust code |

Reuse product behavior and portable logic. Rewrite Electron-specific IPC, Node native access, window lifecycle, packaging, and preload code.

## Failure Rules

- Surface actionable errors with request context; do not collapse failures into generic toasts only.
- Cancellation must propagate from React to Rust to the agent host and Pi run.
- Process shutdown must drain or reject pending requests deterministically.
- Persist app-owned state atomically when corruption would lose user preferences or indexes.
