# Testing Doctrine

## Decision

Use risk-based tests. Prove process boundaries and critical desktop workflows; do not chase coverage.

## Smallest Useful Check

- TypeScript branch, parser, reducer, or protocol behavior: `tsx --test`.
- React user behavior: component test only when interaction logic exists.
- Rust command/service logic: Cargo unit or integration test.
- TypeScript host protocol: process-level contract test with a typed fake Pi adapter plus compiled Node 20 package smoke.
- Critical user workflow: real Tauri desktop E2E test.

## Required Tests

Add focused tests for:

- Tauri command and event contract changes.
- Agent-host framing, cancellation, crash handling, or malformed messages.
- Session discovery, parsing, persistence, and recovery.
- Filesystem, git, worktree, PTY, credential, or destructive operations.
- Streaming reducers with ordering, retry, or partial events.
- Bugs likely to regress.

Skip tests for copy-only docs, static Tailwind changes, passthrough exports, and generated code when lint/build is sufficient proof.

## Desktop E2E Rule

Desktop behavior is not proven by browser-only tests. Use real Tauri E2E coverage for critical flows:

- open workspace;
- create, run, cancel, and reopen a Pi thread;
- recover visibly from agent-host failure;
- preserve sessions across app restart;
- enforce native permission boundaries.

Do not use E2E tests for minor spacing, color, or copy.

## Fixture Rule

Fixtures stay small, safe, deterministic, and free of real credentials or user sessions.
