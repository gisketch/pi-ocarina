# 13 — Composer controls and runtime commands

**What to build:** Provide the shared new-thread and existing-thread composer with keyboard controls, slash commands, model selection, and thinking controls.

**Blocked by:** 06 — Shared Pi auth and model catalog; 12 — Workspace and thread navigation with drafts

**Status:** complete

- [x] Send, newline, stop, model, and thinking interactions have documented keyboard and accessible button behavior.
- [x] Slash suggestions combine supported Pi commands, prompts, and skills with deterministic collision rules.
- [x] New-thread and existing-thread composers share behavior without duplicating state owners.
- [x] Disabled or unavailable models route users to a recoverable model-selection state.

**Flow checks:** F002 — send remains visible; F003 — keyboard, slash, model, and thinking controls; F049 — new and existing threads share the composer surface.
