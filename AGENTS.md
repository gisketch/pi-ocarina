# Agent Map

Project: pi-ocarina

Primary agent: Codex
Enabled agents: Codex, Copilot, Claude Code, Pi

Codex reads this file first. Keep it short. It is the map, not the manual.

## Default Behavior

- Read [docs/index.md](docs/index.md) before large changes.
- Default to caveman style for chat: terse, exact, no filler. Use normal prose only for safety, irreversible actions, or user confusion.
- Stay inside harness engineering: repo-local context, small maps, execution plans, checks, and doc updates.
- For project context and command setup, use `$sonata-setup`.
- For existing project cleanup or migration, use `$sonata-retrofit` before feature work.
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

## Current Project Facts

- Kind: desktop coding-agent application
- Stack: Tauri 2, Rust, strict React TypeScript, Vite, Tailwind CSS, Pi SDK/Pi coding agent
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
- Rust owns native capabilities and supervises the compiled TypeScript agent host.
- Build vertical feature slices; reuse shared UI only after reuse is real.

<!-- sonata:block=workflow:start -->
## Sonata Workflow

- `sonata-work`: route any request through the smallest sufficient workflow and complete it.
- `sonata-fix`: diagnose broken behavior from evidence and fix its root cause.
- `sonata-setup`: configure project context, commands, and optional tracker workflow.
- `sonata-retrofit`: deeply inspect and ground an established codebase before interviewing.
- `sonata-upgrade`: safely apply Sonata updates, then refresh stale docs only.
- Setup, spec, tickets, and implementation use `.sonata/manifest.json` readiness; run `$sonata-setup` while pending.
- `sonata-grill`: resolve one design decision at a time before implementation.
- `sonata-spec`: write concise canonical specs under `docs/specs/`.
- `sonata-tickets`: create vertical slices with explicit blockers.
- `sonata-implement`: implement one slice using risk-based validation.
- `sonata-review`: review Standards, Spec, and Behavior separately.
<!-- sonata:block=workflow:end -->
