# 15 — Queue and steer active runs

**What to build:** Let users queue follow-up prompts or steer the current Pi run, including attachments, without losing ordering or intent.

**Blocked by:** 07 — Create thread and stream a real run; 13 — Composer controls and runtime commands; 14 — Images and file attachments

**Status:** ready-for-agent

- [ ] Enter queues a follow-up while the configured steering shortcut targets the active run.
- [ ] Queued messages and submitted steers are visibly distinct in the timeline.
- [ ] Users can edit or remove queued content without losing attachments.
- [ ] Queue state survives session switches and terminates predictably after completion, cancellation, or failure.

