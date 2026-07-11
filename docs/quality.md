# Quality

## Current Checks

| Check | Command | When To Run |
|---|---|---|
| Sonata structure | `./scripts/check-sonata.sh` | After harness, docs, or skill changes |
| Placeholder sweep | `rg -n "undecided|generic app|Current stack: undecided|Create first useful version" AGENTS.md README.md docs/project-brief.md docs/architecture src tests config` | After stack or harness changes; expect no matches |
| Context check | `./scripts/check-context.sh` | Before handoff when Pi context is expected |

## Planned Stack Checks

Add these to `Current Checks` only after the scaffold exists and each command passes:

- `bun install`
- `bun run lint`
- `bun run test`
- `bun run build`
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- real Tauri desktop smoke/E2E command
- `bun run tauri build`

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
