# Architecture

## Current Shape

- Product: Codex-style desktop application powered by Pi.
- Desktop: Tauri 2 with a small Rust host.
- Frontend: Bun + strict React TypeScript + Vite + Tailwind CSS.
- Agent runtime: Pi SDK/Pi coding agent behind a strict TypeScript host compiled for Node 20.
- Reference: `../pi-gui` for behavior and visual flows, not Electron structure.

## Runtime Direction

```text
React feature
  -> frontend service
  -> Tauri command/event contract
  -> Rust native capability
  -> compiled TypeScript agent host when Pi is needed
  -> Pi SDK / Pi session files
```

Responses and lifecycle updates return through Tauri events. No layer may bypass the layer directly below it for convenience.

## Source Of Truth

- Pi SDK and Pi session files: agent execution and transcript semantics.
- Rust host: native capability policy and process lifecycle.
- React feature state: temporary presentation state only.
- App-owned indexes: disposable caches that can be rebuilt from authoritative files.

## Architecture Docs

- [Desktop](desktop.md): Tauri, Rust, agent-host, and security boundaries.
- [Frontend](frontend.md): React feature slices, shared UI, and state ownership.
- [Testing](../testing.md): boundary-focused, risk-based validation.
- [Development](../development.md): stack and command status.

## Expected Source Shape

```text
src/
  app/                 # providers, routing, shell
  features/            # workspace, thread, timeline, composer, settings
  shared/              # proven reusable UI and utilities
src-tauri/
  src/commands/        # narrow Tauri command modules
  src/services/        # native filesystem, git, PTY, process services
agent-host/
  src/                 # thin Pi SDK adapter and process protocol
tests/
  e2e/                 # critical real-desktop flows
  fixtures/            # small safe fixtures
```

Use the conventional single-app Tauri layout. Do not introduce a monorepo until a second independently built application or package exists.

## Modularity Rules

- Organize by feature or responsibility, not arbitrary technical layers alone.
- Keep public entry points obvious with small `index.ts` or Rust module exports.
- Treat 250-350 lines as a review signal. Split only at a real ownership seam.
- One concrete implementation does not need an interface or factory.
- Shared code must have a real second consumer.
- Contracts crossing a process boundary must be explicit, versionable, and runtime-validated at the boundary.

## YAGNI Rule

Build the first vertical slice before terminal, diffs, worktrees, orchestration, extensions, or release automation. Add each as a separate feature slice when its acceptance criteria are active.
