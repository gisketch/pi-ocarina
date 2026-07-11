# Quality

## Current Checks

| Check | Command | When To Run |
|---|---|---|
| Sonata structure | `./scripts/check-sonata.sh` | After harness, docs, or skill changes |
| Placeholder sweep | `rg -n "undecided|generic app|Current stack: undecided|Create first useful version" AGENTS.md README.md docs/project-brief.md docs/architecture src tests config` | After stack or harness changes; expect no matches |
| Context check | `./scripts/check-context.sh` | Before handoff when Pi context is expected |
| Dependency install | `bun install` | After JavaScript dependency changes |
| Frontend lint | `bun run lint` | After frontend or JavaScript tooling changes |
| Frontend typecheck | `bun run typecheck` | After frontend JavaScript changes |
| Frontend build | `bun run build` | Before frontend handoff |
| Full static/Rust check | `bun run check` | Before implementation handoff |
| Rust build | `bun run rust:build` | After Rust or Tauri configuration changes |
| Rust format | `bun run rust:fmt` | After Rust changes |
| Rust lint | `bun run rust:lint` | After Rust changes |
| Rust tests | `bun run rust:test` | After Rust behavior changes |
| Real macOS desktop smoke | `bun run test:e2e` | After shell, Tauri, or E2E harness changes |
| Agent host contract | `bun run test:agent-host` | After bundled runtime, Pi adapter, or bridge changes |

## Planned Stack Checks

Add release packaging checks when Ticket 42 makes `bun run tauri build` a supported artifact path.

## Quality Bar

- Acceptance criteria exist before broad implementation.
- React, Rust, and agent-host boundaries remain explicit.
- Pi remains the runtime and session source of truth.
- Native capabilities stay least-privilege.
- Non-trivial logic leaves one focused runnable check.
- Validation is reproducible by another agent.
- New decisions update docs and repeated failures improve the harness.

## Retrofit Checks

When `/retrofit-sonata` runs, verify:

- Existing markdown was preserved, moved, linked, or summarized.
- `AGENTS.md` stayed short.
- Commands are verified or clearly marked planned.
- Broad migration work has an execution plan.
