# Full TypeScript Migration

## Goal

Migrate every authored JavaScript-family file to strict TypeScript without changing UI, Pi protocol version 1, or session behavior.

## Acceptance Criteria

- No authored `.js`, `.jsx`, `.mjs`, or `.cjs` remains outside ignored generated output.
- Frontend, tools, E2E, and agent host pass separate strict typechecks.
- No explicit `any`, `@ts-nocheck`, or `@ts-ignore` remains.
- Tauri and agent-host boundaries use typed operation maps, discriminated events, and runtime validation.
- The bundled host runs compiled `agent-host/dist/host.js` on pinned Node 20.
- Lint, unit/contract tests, production build, Rust checks, real desktop smoke, and packaged app checks pass.

## Progress

- [x] Add strict frontend, tools, agent-host, and build TypeScript configs.
- [x] Convert React source, shared UI, feature tests, configs, E2E, and scripts.
- [x] Add typed frontend contracts and validated agent client.
- [x] Add `TauriCommandMap`/`TauriEventMap`, runtime guards, and one shared native client; feature code has no raw `invoke` or `listen` calls.
- [x] Convert the Pi host and validate JSONL payloads with TypeBox.
- [x] Compile the host into ignored Node 20-compatible output.
- [x] Update Rust supervision and packaged resource paths.
- [x] Remove duplicate root Pi and Node runtime dependencies.
- [x] Update harness and architecture documentation.
- [x] Complete full static, Rust, desktop, and package validation.
- [x] Commit the migration as a green behavior-preserving change.

## Validation

- `bun run lint`
- `bun run typecheck`
- `bun run test:frontend-unit`
- `bun run test:agent-host`
- `bun run build`
- `bun run check`
- `bun run test:e2e`
- `bun run package:macos && bun run test:packaged`

## Decision Log

- 2026-07-12: TypeScript 5.9 is pinned because TypeScript 7 is not yet supported by the current `typescript-eslint` toolchain.
- 2026-07-12: Customized COMP LIB/Shadcn primitives are manually typed; none are regenerated.
- 2026-07-12: Generated JavaScript exists only in ignored `agent-host/dist` because the packaged runtime executes JavaScript on Node 20.
