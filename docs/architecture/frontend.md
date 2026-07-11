# Frontend Architecture

## Decision

Use React JavaScript, Vite, and Tailwind CSS. Stay with JavaScript as requested; use JSDoc and runtime validation where data crosses process or persistence boundaries.

Use React state for local UI state. Add a state library only when a demonstrated cross-feature state problem cannot stay in a feature service or provider.

## Source Shape

```text
src/
  app/                  # boot, providers, routes, shell
  features/
    workspaces/
    threads/
    timeline/
    composer/
    settings/
  shared/
    ui/                 # components with real reuse
    lib/                # small framework-neutral helpers
    contracts/          # frontend view of Tauri contracts
  styles/
```

Each feature owns its components, hooks, state, service calls, and tests. Export a small public surface from the feature root.

## Component Rules

- Reuse project components first, native HTML second, then add the smallest needed component.
- Tailwind theme tokens are the visual source of truth; avoid scattered hardcoded colors.
- Feature-only UI stays local until a second real use proves it belongs in `shared/ui`.
- Preserve keyboard access, focus visibility, semantics, and reduced-motion behavior.
- Copy `pi-gui` interaction behavior only after tracing the full flow and translating native calls to Tauri.

## State Rules

- Server/agent/session state comes from services and streamed events, not duplicated component caches.
- Keep draft composer state local.
- Derive presentation values instead of persisting duplicates.
- Unsubscribe from Tauri events during component cleanup.
- Bound rendered history; long sessions need incremental loading or virtualization when measurements justify it.

## File Rule

Prefer cohesive files readable in one pass. Treat 250-350 lines as a review signal and avoid 350+ line source files unless generated, data-heavy, or explicitly justified.
