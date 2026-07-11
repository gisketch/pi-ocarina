# 17 — Long transcript viewport

**What to build:** Keep long and streaming conversations responsive while preserving each thread's intended scroll position.

**Blocked by:** 16 — Markdown and safe external links

**Status:** ready-for-agent

- [ ] Large transcripts render through bounded or virtualized rows without losing message order.
- [ ] Bottom-pinned threads follow streaming deltas and composer height changes.
- [ ] Off-bottom positions survive thread switches and restart without jumping.
- [ ] Opening or reopening a long thread lands stably without visible smooth-scroll travel from the top.

