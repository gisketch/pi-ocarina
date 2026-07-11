# 20 — Fork and tree navigation

**What to build:** Let users branch from prior assistant messages and inspect or summarize Pi's session tree without mutating the source branch.

**Blocked by:** 08 — Tool-call timeline; 18 — Thread naming

**Status:** ready-for-agent

- [ ] Forking an assistant response creates and selects a distinct Pi session with the expected history.
- [ ] The tree command is available only when a session exists and supports branch navigation.
- [ ] Tool results in tree views use compact bounded previews.
- [ ] Real-provider branch summarization returns to a usable thread state on success, cancellation, or failure.

