# 43 — beta.32 parity audit

**What to build:** Prove the Tauri implementation covers every included desktop behavior frozen from pi-gui beta.32 and records every intentional exclusion.

**Blocked by:** 01 — Tauri shell and real-desktop test lane; 02 — Self-contained upstream Pi packaging proof; 03 — Versioned Rust-agent-host bridge; 04 — Recoverable Rust app-state store; 05 — Native workspace catalog; 06 — Shared Pi auth and model catalog; 07 — Create thread and stream a real run; 08 — Tool-call timeline; 09 — Stop, failure, and runtime prompts; 10 — Restart and running-session recovery; 11 — Live CLI and desktop coexistence; 12 — Workspace and thread navigation with drafts; 13 — Composer controls and runtime commands; 14 — Images and file attachments; 15 — Queue and steer active runs; 16 — Markdown and safe external links; 17 — Long transcript viewport; 18 — Thread naming; 19 — Thread organization; 20 — Fork and tree navigation; 21 — Workspace management; 22 — Mentions and changes panel; 23 — Files and review workbench; 24 — Integrated terminal; 25 — Terminal and diff responsive layout; 26 — Worktree lifecycle; 27 — Repository model scope; 28 — Parallel session runs; 29 — Provider credential settings; 30 — Custom OpenAI-compatible endpoints; 31 — Model onboarding and recovery; 32 — Skills discovery and commands; 33 — Extension discovery and management; 34 — Extension dock UI; 35 — Extension dialogs and compatibility fallback; 36 — Extension reload and session continuity; 37 — Notifications and attention state; 38 — Appearance and responsive shell; 39 — Multi-window behavior; 40 — Orchestration child-thread tools; 41 — Orchestration supervision; 42 — Self-contained local macOS app

**Status:** complete

- [x] Every included beta.32 flow row has exactly one owning ticket and one passing automated or documented acceptance check.
- [x] All JavaScript, Rust, process-contract, real-desktop, and packaged-app quality commands pass from a clean checkout.
- [x] A packaged smoke covers real auth, workspace opening, thread execution, restart, native picker, dynamic extension, and terminal.
- [x] Audit confirms exclusions: update flow, website/video/Homebrew, signing/notarization, Linux/Windows, standalone computer-use, and pi-gui app-state migration.

**Report:** `.scratch/pi-gui-tauri-parity/audit.md`. **Verifier:** `bun run audit:parity`.
