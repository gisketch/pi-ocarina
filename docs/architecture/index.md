# Architecture

## Current Shape

- Kind: greenfield (no source yet; scaffold happens in `$sonata-implement`)
- Stack: Electron + Svelte 5 (runes) + Vite (via electron-vite) + TypeScript; pnpm

## Planned System Map

Three Electron worlds, one hard boundary:

- **Main process (Node)** — owns pi. Hosts `AgentSession` from
  `@earendil-works/pi-coding-agent` in-process, session catalog, node-pty terminals,
  workspace/git status. Nothing UI-related lives here.
- **Preload** — typed IPC bridge only (`contextBridge`); no logic.
- **Renderer (Svelte 5)** — pure view over an event stream. Never imports pi types.

## Boundary Rule

- **SessionDriver adapter (main process)**: owns translation of pi
  `AgentSessionEvent`s into a UI-facing event vocabulary; public interface is the
  typed IPC channel; may depend on pi SDK; renderer may depend only on the IPC
  types, never on pi packages. Rationale: decouples UI from pi versioning
  (pattern proven by pi-gui) and keeps agent GC/work off the frame budget.
- **Streaming coalescer (renderer edge)**: agent events are batched per
  `requestAnimationFrame` before touching reactive state.
- Enforcement: once code exists, a lint/depcheck rule must fail any renderer import
  of `@earendil-works/*`.

Do not invent further layers before the code needs them.
