# 18 — Thread naming

**What to build:** Give new threads useful generated titles while preserving explicit user renames and stable recovery behavior.

**Blocked by:** 07 — Create thread and stream a real run; 12 — Workspace and thread navigation with drafts

**Status:** ready-for-agent

- [ ] New local and worktree threads show a placeholder before one generated title is applied.
- [ ] Manual rename always wins over delayed generation, including after Stop.
- [ ] Later prompts do not retrigger automatic naming.
- [ ] Restart heals catalog placeholders when the Pi session already has the final title.

