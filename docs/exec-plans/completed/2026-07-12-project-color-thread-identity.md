# Project Color and Thread Identity

## Goal

Implement the approved [Project Color and Thread Identity spec](../../specs/2026-07-12-project-color-thread-identity.md) as two demoable frontend slices.

## Acceptance criteria

- Root projects receive deterministic curated colors inherited by worktrees and scoped to chats.
- Established threads show stable project-colored 5×5 Matrix avatars in sidebar icon slots.
- Only running avatars animate between two closely related frames at 600ms per frame; reduced motion remains static.

## Context links

- [Canonical spec](../../specs/2026-07-12-project-color-thread-identity.md)
- [Frontend architecture](../../architecture/frontend.md)
- [Quality checks](../../quality.md)

## Completed tickets

1. Stable project color: added the shared deterministic resolver, eight-color OLED palette, scoped chat tokens, contrast tests, and palette fixture. Blocked by: None.
2. Animated thread identity: added deterministic two-frame avatars, running-only animation, sidebar integration, status preservation, tests, and fixtures. Blocked by: Ticket 1 (complete).

## Validation

- Frontend unit tests: 13 passed.
- Frontend, tooling, and agent-host typechecks: passed.
- Lint: passed with 34 pre-existing Fast Refresh warnings.
- Production build and Cosmos export: passed.
- Rust format, clippy, 21 tests, and build: passed.
- Full `bun run check`: feature checks passed; stopped on the pre-existing packaged-runtime assertion requiring Node 20 while the harness ran Node 24.16.0.

## Decision log

- 2026-07-12: Project color provides broad identity; Matrix geometry provides thread identity.
- 2026-07-12: Identity is derived without persistence, and worktrees inherit their root project seed.
- 2026-07-12: Running avatars use two 5×5 frames at 600ms per frame.
- 2026-07-12: Syntax highlighting retains the global code-primary token when chat primary changes.

## Progress log

- 2026-07-12: Spec and two-ticket breakdown approved.
- 2026-07-12: Both tickets implemented and validated in an isolated worktree.
