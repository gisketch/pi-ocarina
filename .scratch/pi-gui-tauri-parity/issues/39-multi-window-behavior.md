# 39 — Multi-window behavior

**What to build:** Support multiple Tauri windows with independent navigation and terminals while shared sessions, drafts, and dialogs remain correctly scoped.

**Blocked by:** 24 — Integrated terminal; 28 — Parallel session runs; 38 — Appearance and responsive shell

**Status:** ready-for-agent

- [ ] Each window keeps independent workspace/thread selection and can select empty workspaces.
- [ ] Opening the same thread in two windows mirrors authoritative draft updates without loops.
- [ ] Dialogs and editor-sync events target visible matching windows and cancel when no eligible window remains.
- [ ] Terminals remain window-local while session/run state stays globally consistent.

