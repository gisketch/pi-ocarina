# Agent Targets

Sonata stores one canonical skill set under `.agents/skills/`. Agent-specific locations are generated compatibility copies, never separate sources of truth.

## Built-In Skills

- `sonata-work`
- `sonata-fix`
- `sonata-setup`
- `sonata-retrofit`
- `sonata-upgrade`
- `sonata-grill`
- `sonata-spec`
- `sonata-tickets`
- `sonata-implement`
- `sonata-review`

## Optional Compatibility

- Codex receives `.codex/skills/` when selected.
- Copilot reads canonical `.agents/skills/` and receives `copilot-instructions.md` when selected.
- Claude Code receives `CLAUDE.md` and `.claude/skills/` when selected.
- Pi receives `.pi/settings.json` and `.pi/skills/` when selected.

The root `AGENTS.md` remains the agent-neutral project map. `CLAUDE.md` and Copilot instructions stay as portable pointer files rather than symlinks.
