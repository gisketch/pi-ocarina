# Development Setup

## Decisions

- Package manager: Bun.
- Desktop: Tauri 2 and Rust.
- Frontend: React JavaScript, Vite, Tailwind CSS.
- Agent runtime: Pi SDK/Pi coding agent through a JavaScript host process.
- Repository shape: one Tauri application until a real second package requires a workspace.

## Command Status

Only the Sonata harness exists today. These commands are targets for the scaffold and must not be called verified until their scripts exist and pass:

```bash
bun install
bun run tauri dev
bun run lint
bun run test
bun run build
bun run tauri build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Dependency Rules

- Use Tauri core or an official plugin before custom native code.
- Use browser and language standard libraries before adding packages.
- Reuse installed dependencies before adding alternatives.
- Pin the Pi SDK package deliberately during scaffold; do not mix Pi forks or duplicate agent runtimes.
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
