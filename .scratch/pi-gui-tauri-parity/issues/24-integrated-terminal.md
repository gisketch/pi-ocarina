# 24 — Integrated terminal

**What to build:** Give each workspace a real PTY terminal with tabs, persistent output, shell selection, and reliable clipboard input.

**Blocked by:** 05 — Native workspace catalog; 12 — Workspace and thread navigation with drafts

**Status:** ready-for-agent

- [ ] Opening the terminal starts a PTY in the selected workspace and supports multiple independent tabs.
- [ ] Output survives panel hide/show and expected thread navigation.
- [ ] Shell preference persists and invalid shells fail clearly.
- [ ] Normal and oversized pastes arrive exactly once without truncation; terminal takeover controls remain usable.

