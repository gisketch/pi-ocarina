# Frontend Architecture

## Decision

Use strict React TypeScript, Vite, and Tailwind CSS. External data starts as `unknown` and is runtime-validated where it crosses process or persistence boundaries.

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
    ui/                 # Shadcn primitives generated through the CLI
    lib/                # small framework-neutral helpers
    contracts/          # typed and runtime-validated Tauri/Pi contracts
  styles/
```

Each feature owns its components, hooks, state, service calls, and tests. Export a small public surface from the feature root.

## Component Rules

- Reuse project components first. When a new primitive is needed, run `shadcn add <component>` before building one.
- Tailwind theme tokens are the visual source of truth; avoid scattered hardcoded colors.
- `--pb-content-font-size` and `--pb-content-line-height` feed Tailwind's standard `text-sm` and `text-base` utilities, so existing and newly generated Shadcn components inherit normal typography without component-specific overrides.
- Keep Shadcn primitives in `shared/ui` and feature composition inside its owning feature.
- Import primitives through `@/shared/ui/<component>`; do not import Radix directly when Shadcn covers the behavior.
- Leave generated primitives at accessible defaults until the product-wide customization pass.
- Shared Shadcn/Radix primitives are manually typed and preserve their current accessible APIs; do not regenerate customized components.
- Features call typed Tauri/agent client seams rather than raw untyped process messages.
- Feature-only UI stays local until a second real use proves it belongs in `shared/ui`.
- Preserve keyboard access, focus visibility, semantics, and reduced-motion behavior.
- Pi Ocarina owns its design system in `src/shared`; the sibling component-library prototype is migration input, never a runtime dependency.
- The shipped appearance is dark-only. Atkinson Hyperlegible Next is body text, Departure Mono is headings/composer input, and JetBrains Mono is buttons/code.
- Application icons use the shared Pixelarticons wrapper rather than importing icon packages directly.
- The current shell intentionally exposes only two columns: sidebar and chat. See [UI Increment Map](ui-increments.md) before restoring secondary surfaces.
- Copy `pi-gui` interaction behavior only after tracing the full flow and translating native calls to Tauri.
- Runtime extension commands win name collisions with host commands; extension mentions precede file mentions.

## State Rules

- Server/agent/session state comes from services and streamed events, not duplicated component caches.
- Keep draft composer state local.
- Composer keystrokes update local state immediately. Durable draft projections are coalesced and explicitly flushed on blur, submit, thread navigation, and window close; never invoke Tauri persistence per keystroke.
- Derive presentation values instead of persisting duplicates.
- Unsubscribe from Tauri events during component cleanup.
- Bound rendered history; long sessions need incremental loading or virtualization when measurements justify it.

## File Rule

Prefer cohesive files readable in one pass. Treat 250-350 lines as a review signal and avoid 350+ line source files unless generated, data-heavy, or explicitly justified.
