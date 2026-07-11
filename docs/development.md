# Development Setup

## Decisions

- Package manager: Bun.
- Desktop: Tauri 2 and Rust.
- Frontend: strict React TypeScript, Vite, Tailwind CSS.
- Agent runtime: Pi SDK/Pi coding agent through a strict TypeScript host compiled for Node 20.
- Repository shape: one Tauri application until a real second package requires a workspace.

## Command Status

Verified:

```bash
bun install
bun run lint
bun run typecheck
bun run typecheck:frontend
bun run typecheck:tools
bun run typecheck:agent-host
bun run check
bun run test
bun run build
bun run rust:build
bun run rust:fmt
bun run rust:lint
bun run rust:test
bun run test:agent-host
```

Local development:

```bash
bun run tauri dev
```

The real macOS desktop smoke uses an embedded WebDriver server and an E2E-only Tauri config:

```bash
bun run test:e2e
```

Normal builds do not grant the E2E capability or expose the WebdriverIO frontend bridge.

## Dependency Rules

- Use Tauri core or an official plugin before custom native code.
- Use browser and language standard libraries before adding packages.
- Reuse installed dependencies before adding alternatives.
- Pin the Pi SDK package deliberately during scaffold; do not mix Pi forks or duplicate agent runtimes.
- Invoke the agent host with `bun run agent-host`; the command uses the pinned Node 20 binary directly and never resolves Node, Bun, or Pi from `PATH`.
- `agent-host` exclusively owns Pi and Node runtime dependencies. Root frontend dependencies must not duplicate them.
- Generated `agent-host/dist/*.js` is ignored and reproduced by `bun run build:agent-host` before development, builds, and packaging.
- Document why every native Tauri plugin needs its capability.

## Configuration Rules

- Commit safe examples only.
- Keep credentials in Pi-owned or OS-backed stores.
- Keep Tauri capabilities least-privilege and review changes as security-sensitive.
- Do not expose environment secrets to Vite or React.

## Resume Rule

1. Read `AGENTS.md`.
2. Read `docs/project-brief.md`.
3. Read `docs/architecture/index.md`.
4. Read the active execution plan.
5. Run applicable checks from `docs/quality.md`.
