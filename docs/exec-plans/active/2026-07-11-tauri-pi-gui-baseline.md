# Tauri Pi GUI Baseline

## Goal

Build the first maintainable vertical slice of a `pi-gui`-style desktop app using Tauri 2, React JavaScript, Tailwind CSS, and the Pi SDK/Pi coding agent.

## Acceptance Criteria

- User opens a workspace and creates or reopens a Pi thread.
- Prompt and streamed Pi activity render in a timeline.
- Restart recovers the thread from Pi-owned session data.
- React uses narrow Tauri commands/events only.
- Rust supervises a thin JavaScript Pi agent host.
- Lint, JavaScript tests, Rust checks, build, and a real-desktop smoke pass.

## Context Links

- [Project brief](../../project-brief.md)
- [Architecture](../../architecture/index.md)
- [Desktop boundary](../../architecture/desktop.md)
- [Frontend boundary](../../architecture/frontend.md)
- [Testing doctrine](../../testing.md)
- Reference implementation: `../pi-gui`

## Steps

- [ ] Inventory the exact `pi-gui` flows and portable code needed for the first slice.
- [ ] Resolve and record the Pi SDK package/version and packaged agent-host strategy.
- [ ] Scaffold one Tauri 2 app with Bun, React JavaScript, Vite, and Tailwind.
- [ ] Define the smallest versioned command/event protocol.
- [ ] Implement workspace open and Pi session discovery.
- [ ] Implement prompt, streaming timeline, cancellation, and clear failures.
- [ ] Implement restart/reopen behavior using Pi-owned session data.
- [ ] Add the smallest focused contract tests and real-desktop smoke.
- [ ] Replace planned quality commands with verified commands.

## Validation

- `./scripts/check-sonata.sh`
- JavaScript lint/test/build commands recorded after scaffold.
- Rust fmt/clippy/test commands recorded after scaffold.
- Real Tauri desktop workspace-to-reopened-thread smoke.

## Decision Log

- 2026-07-11: Use `../pi-gui` for product behavior, not Electron architecture.
- 2026-07-11: Keep a single Tauri app; no monorepo until a second build unit exists.
- 2026-07-11: Put Pi SDK integration in a JavaScript host supervised by Rust.
- 2026-07-11: Keep Pi sessions authoritative and app indexes rebuildable.
- 2026-07-11: Defer terminal, diffs, worktrees, orchestration, extensions, and packaging until the core slice works.

## Progress Log

- 2026-07-11: Harness initialized with product, architecture, testing, and quality rules.
