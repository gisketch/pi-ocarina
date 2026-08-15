# Project Brief

## Product Vision

PiOcarina: a keyboard-first native desktop GUI for the pi coding agent. A dense,
terminal-native shell where multiple workspaces each hold multiple agent threads,
navigated like a tiling window manager (niri-style horizontal thread strip) with
vim-modal keys. It must feel like a native 120fps desktop app, never like a web page.

Reference designs (canonical, fully specified in Claude Design project
`04e5902c-e9d6-4b83-a265-ab3d784bb21e`):

- `PiOcarina v2.dc.html` — full shell: titlebar, workspace rail (5×5 pixel
  identicons), thread strip, composer, terminal drawer, statusbar, leader/which-key
  bar, workspace switcher, command palette, keymap overlay.
- `PiOcarina Components.dc.html` — 13 component sections: identity/oklch seeded
  accents, primitives, type, messages+markdown, tool-call ledger, composer+statusbar,
  overlays, skeletons (steps() only), model/reasoning controls, composer extras,
  agent flow (checkpoints, queued steering, compacting, subagents, tool errors),
  navigation (@-mention, minimap, history search), git+shell (commit card, terminal,
  toasts, confirm modal, connection banner).
- `support.js` in that project is the Claude Design preview runtime only — not shipped.

Prior art: [pi-ui](https://github.com/hyperpuncher/pi-ui) (Deno + Datastar, pi SDK
in-process), [pi-gui](https://www.pi-gui.com/) (Electron 34 + React 19, pi SDK
in-process behind a SessionDriver interface).

## Users

- Primary user: the developer/owner (Ghe), driving pi daily across several repos.
- Secondary users: other pi users if it is later published.
- Operating environment: macOS first (Apple Silicon, ProMotion displays); Electron
  keeps Windows/Linux open later.

## Current Milestone

- Outcome: **Static shell** — the full `PiOcarina v2.dc.html` layout implemented
  pixel-faithfully in Electron + Svelte 5 with mock data (the three demo workspaces
  and threads from the design), no pi integration yet.
- Acceptance behavior:
  - App boots into the dark shell: titlebar, workspace rail with pixel identicons,
    niri-style thread strip, composer, statusbar, terminal drawer (static content).
  - Keyboard layer works as designed: `1–3` jump workspace, `h/l` move thread,
    `␣` leader + which-key bar, `i`/`esc` insert/normal, `w` switcher, `⌘K` palette,
    `?`/`␣k` keymap overlay, `t` terminal drawer, `j/k` scroll.
  - Thread strip slides with the design's easing; workspace accent re-tints the UI.
  - Ask card, approve card, and tool-ledger expand/collapse respond to clicks.
  - Motion stays on `transform`/`opacity`; interaction feels frame-perfect on a
    ProMotion display (no visible jank while sliding or opening overlays).
- Next milestone (queued): pi vertical slice — composer → `AgentSession` in main
  process → streamed reply + live tool ledger.

## Problem

pi is a terminal agent. Multi-workspace, multi-thread agent work in a plain TTY has
no spatial navigation, no persistent visual ledger of tool activity, and no ambient
status. Existing GUIs (pi-ui, pi-gui) do not implement the PiOcarina design language.

## Non-Goals

- Not a general IDE or editor.
- Not a web/hosted app; local desktop only.
- (more to be resolved in setup interview)

## Later / Not Now

- Windows/Linux packaging.
- (more to be resolved in setup interview)

## Constraints

- Stack (decided 2026-08-15):
  - Shell: **Electron** (main process = Node) — chosen over Deno Desktop (young
    platform, node-pty risk) and Tauri (Rust backend buys nothing; pi is TS).
  - pi integration: **`AgentSession` from `@earendil-works/pi-coding-agent`
    in-process in the Electron main process** (pi's documented SDK path; RPC mode
    `pi --mode rpc` exists as fallback). UI never imports pi types directly — a
    SessionDriver-style adapter layer projects agent events into UI state over
    typed IPC.
  - Renderer: **Svelte 5 (runes) + Vite + TypeScript**. Fine-grained reactivity for
    token streaming; no VDOM diffing.
  - Components: **no component library** (no shadcn). The Components design file is
    the design system: small Svelte components + CSS custom properties for tokens
    (seeded accent = `oklch(0.76 0.14 <workspace-hue>)`). Melt UI builders allowed
    for a11y-heavy behaviors (palette listbox, dialogs) only.
  - Motion: **CSS-first** — `transform`/`opacity` transitions,
    `cubic-bezier(.22,1,.36,1)` strip slide, `steps()` skeletons/carets. Svelte
    `Spring` if physics needed. No motion library.
  - Terminal: xterm.js + WebGL addon, node-pty in main process.
- Performance (durable, from day one):
  - Animate only `transform`/`opacity`; thread strip is one composited `translateX`.
  - Virtualize thread scrollback; `content-visibility`/`contain` on collapsed
    ledger expansions.
  - Coalesce streaming agent events per `requestAnimationFrame` in the adapter.
  - Agent/session work stays in the main process; renderer is a pure view.
- Package manager: **pnpm**. Build tooling: **electron-vite** (main/preload/renderer
  in one config, Vite HMR); `electron-builder` to be added when packaging becomes real.
- Runtime: Electron (Node main + Chromium renderer); TypeScript everywhere.
- Data: local only — pi sessions on disk; no server.
- Security: pi runs with the user's own permissions; approval gates surfaced in UI.
- Fonts: Departure Mono (chrome), JetBrains Mono (body/code) — bundle locally, no CDN.

## Open Questions

- Current milestone scope and acceptance behavior.
- Package manager (pnpm/npm/bun) and Electron tooling (Forge vs electron-builder vs
  electron-vite).
- Issue tracking choice.
- Git initialization.
