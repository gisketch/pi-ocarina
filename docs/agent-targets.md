# Agent Targets

Primary agent: Codex

Enabled agents: Codex, Copilot, Claude Code, Pi

## Codex

Codex is the default path. It should read [AGENTS.md](../AGENTS.md), then follow only the links needed for the current task.

Local Codex skills live in `.codex/skills/<name>/SKILL.md`. These should appear in Codex CLI's skill picker after starting or refreshing a session in the project root.

Use these project skills:

- `$sonata-work` routes ordinary work.
- `$sonata-setup` configures readiness and project context.
- `$sonata-retrofit` grounds established codebases.
- `$sonata-spec`, `$sonata-tickets`, `$sonata-implement`, and `$sonata-review` handle the delivery lifecycle.

## Copilot

When enabled, Copilot receives [copilot-instructions](../.github/copilot-instructions.md) and the root workflow map.

## Claude Code

When enabled, Claude Code receives [CLAUDE.md](../CLAUDE.md) and copied skills under `.claude/skills/`.

## Pi

When enabled, Pi receives project settings, local skills, and prompt templates under `.pi/`.

Pi reads `AGENTS.md`, so keep the root map agent-neutral and short. Project skills are available as `/skill:sonata-work`, `/skill:sonata-setup`, `/skill:sonata-retrofit`, and the other `sonata-*` workflow skills.

## Non-Negotiables

- Caveman style by default for chat.
- Harness docs are source of truth.
- Execution plans for broad work.
- Checks before handoff.
- `../pi-gui` defines product behavior, not Tauri architecture.
- React stays UI-only; Rust owns native access and supervises the Pi SDK host.
- Pi remains the source of truth for agent and session behavior.
- Prefer vertical feature slices and proven reuse over speculative shared layers.

## Project Skill Rule

Do not copy NIA telemetry backend/deployment skills into this desktop repo. Add a project skill only after a repeated Tauri, React, or Pi-runtime workflow proves that durable instructions would save work.
