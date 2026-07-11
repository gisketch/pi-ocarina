# Project Brief

## One-Line Intent

A maintainable Tauri desktop home for the Pi coding agent, preserving the useful `pi-gui` workflow without Electron.

## Project Kind

Cross-platform desktop coding-agent application.

## Stack

- Desktop shell: Tauri 2 with a small Rust host.
- Frontend: React JavaScript, Vite, and Tailwind CSS.
- Agent runtime: Pi SDK and Pi coding agent in a dedicated JavaScript host process.
- Package manager: Bun.
- Native responsibilities: Rust owns Tauri commands, process lifecycle, filesystem access, git/worktrees, PTY integration, notifications, and secure settings.

## Users

- Primary user: developers who want a Codex-style desktop workflow powered by Pi.
- Secondary users: maintainers and coding agents extending the app.
- Non-goals: building a new agent runtime, forking Pi behavior, or reproducing Electron internals in Tauri.

## Problem

Pi is capable from the terminal, but desktop workflows need durable threads, workspace management, tool timelines, diffs, and terminal access. The existing `../pi-gui` proves the product shape, but this project needs a smaller Tauri implementation with explicit boundaries that remains easy to extend and resume.

## Product Reference

Use `../pi-gui` as the behavioral and visual reference. Preserve its useful workflows, not its Electron architecture.

- Pi remains the source of truth for agent execution, auth, models, skills, extensions, and session semantics.
- Reuse portable code only when it fits the new boundary and retains required license attribution.
- Reimplement Electron main/preload behavior behind narrow Tauri commands.
- Do not create a second agent runtime or a second authoritative session store.

## First Useful Version

Deliver one end-to-end vertical slice:

1. Open a local workspace.
2. Create or reopen a Pi thread.
3. Send a prompt through the Pi SDK.
4. Stream assistant text and tool activity into a timeline.
5. Reopen the app and recover the thread from Pi-owned session data.

Diffs, integrated terminal, worktrees, orchestration, extension management, themes, and release packaging follow in separate slices after this core path works.

## Acceptance Criteria

- User can open a workspace, run Pi, see streamed output, and reopen the resulting thread.
- React has no direct filesystem, shell, git, credential, or process access.
- Rust exposes narrow commands/events and supervises the JavaScript agent host.
- The agent host is a thin adapter over the Pi SDK; Pi session data stays authoritative.
- Features live in focused responsibility slices with obvious entry points.
- Setup, architecture, testing, and quality docs match runnable commands before implementation handoff.

## Constraints

- Package manager: Bun only unless a verified dependency requires otherwise.
- Runtime: Tauri 2/Rust desktop host, webview React UI, JavaScript Pi agent host.
- Data: Pi session files are authoritative; app-owned preferences and indexes must be rebuildable.
- Security: least-privilege Tauri capabilities; no broad shell/filesystem access from React; secrets remain in Pi or OS-backed stores.
- Performance: stream incrementally; avoid loading complete session histories or repository trees when a bounded view is enough.
- Maintainability: cohesive feature slices, explicit process contracts, reuse-first components, and no speculative abstractions.
- File size: treat 250-350 lines as a review signal; inspect and justify files above 350 lines.
- Token budget: caveman chat by default; durable decisions belong in repo docs.

## Open Questions

- Exact upstream Pi SDK package/version to pin during scaffold.
- Whether the JavaScript agent host ships as a Bun-compiled sidecar or another packaged runtime after a packaging spike.
- Initial desktop platform targets beyond macOS.
- Which `pi-gui` visual theme becomes the first implementation baseline.
