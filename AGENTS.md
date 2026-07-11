# Agent Map

Project: pi-ocarina

Primary agent: Codex
Enabled agents: Codex, Copilot, Claude Code, Pi

Codex reads this file first. Keep it short. It is the map, not the manual.

## Default Behavior

- Read [docs/index.md](docs/index.md) before large changes.
- Default to caveman style for chat: terse, exact, no filler. Use normal prose only for safety, irreversible actions, or user confusion.
- Stay inside harness engineering: repo-local context, small maps, execution plans, checks, and doc updates.
- For new product context, use `/init-sonata` and update [docs/project-brief.md](docs/project-brief.md).
- For existing project cleanup or migration, use `/retrofit-sonata` before feature work.
- For multi-step work, create or update an execution plan in [docs/exec-plans/active](docs/exec-plans/active).
- Run checks from [docs/quality.md](docs/quality.md) before final handoff.
- If an agent struggles twice on the same class of issue, add a doc, script, test, fixture, or rule.

## Knowledge Map

- [docs/project-brief.md](docs/project-brief.md): product intent and constraints.
- [docs/core-beliefs.md](docs/core-beliefs.md): harness philosophy, including small-file modularity.
- [docs/architecture/index.md](docs/architecture/index.md): structure and boundaries.
- [docs/quality.md](docs/quality.md): validation commands.
- [docs/exec-plans/README.md](docs/exec-plans/README.md): planning workflow.
- [docs/references/harness-engineering.md](docs/references/harness-engineering.md): harness principles.
- [docs/references/caveman.md](docs/references/caveman.md): compression rules.

## Current Project Facts

- Kind: desktop coding-agent application
- Stack: Tauri 2, Rust, React JavaScript, Vite, Tailwind CSS, Pi SDK/Pi coding agent
- Package manager: bun
- Default caveman mode: full
- Agent targets: Codex, Copilot, Claude Code, Pi

## Work Loop

1. Clarify goal and acceptance criteria.
2. Read only relevant docs.
3. Plan at the smallest useful level.
4. Implement inside documented boundaries.
5. Validate with current checks.
6. Update docs when behavior, decisions, or constraints change.

## Product Boundaries

- `../pi-gui` is the behavioral and visual reference; do not copy its Electron architecture into Tauri.
- Pi owns agent execution and session semantics. Keep the Pi SDK adapter thin.
- React is UI-only. Native access crosses narrow Tauri commands and events.
- Rust owns native capabilities and supervises the JavaScript agent host.
- Build vertical feature slices; reuse shared UI only after reuse is real.

<!-- sonata:block=integrations:start -->
## Sonata Integrations

- Pi is enabled. Project skills live in `.pi/skills/`; prompt templates live in `.pi/prompts/`. For Serena in Pi, install `pi-serena-tools` only after reviewing the package.
<!-- sonata:block=integrations:end -->
