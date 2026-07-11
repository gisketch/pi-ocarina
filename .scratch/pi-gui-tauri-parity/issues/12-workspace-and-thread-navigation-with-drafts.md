# 12 — Workspace and thread navigation with drafts

**What to build:** Let users move quickly among workspaces and threads while each composer draft and selected transcript remains correctly scoped.

**Blocked by:** 05 — Native workspace catalog; 10 — Restart and running-session recovery

**Status:** ready-for-agent

- [ ] Sidebar navigation republishes the intended transcript without cross-session state bleed.
- [ ] Drafts survive fast switches and restart and ignore stale persistence acknowledgements.
- [ ] Host-requested editor replacements target only the correct visible session.
- [ ] Empty workspaces and threads have clear navigable states.

