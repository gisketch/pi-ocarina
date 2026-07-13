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
- Scroll containers suppress overscroll chaining and rubber-band elasticity.
- Pi Ocarina owns its design system in `src/shared`; the sibling component-library prototype is migration input, never a runtime dependency.
- The shipped appearance is dark-only. Space Grotesk is default transcript prose, Geist Pixel is the default UI mono and user-message face, and Departure Mono is default headings, composer input, and editor/code surfaces.
- Settings can override the Application and Code typography roles with system font families. Components consume semantic font variables and never read font preferences directly.
- Dark appearance customization derives surfaces from one bounded background-brightness preference, while stable workspace hashing selects from one ordered project palette.
- Application icons use the shared Pixelarticons wrapper rather than importing icon packages directly.
- The shell exposes sidebar and chat plus one collapsible, resizable Changes pane. Other secondary surfaces remain governed by the [UI Increment Map](ui-increments.md).
- Settings is a dedicated in-window view layered over the still-mounted app runtime so active threads, drafts, scroll positions, and Changes state survive entry and exit.
- Copy `pi-gui` interaction behavior only after tracing the full flow and translating native calls to Tauri.
- Runtime extension commands win name collisions with host commands; extension mentions precede file mentions.

## State Rules

- Server/agent/session state comes from services and streamed events, not duplicated component caches.
- Agent runs render through one run presentation reducer: Pi lifecycle content and semantic tool rows stay inside the active disclosure, while explicit `final_answer` content—or the provider-neutral terminal fallback—renders as the handoff.
- Keep draft composer state local.
- Composer keystrokes update local state immediately. Durable draft projections are coalesced and explicitly flushed on blur, submit, thread navigation, and window close; never invoke Tauri persistence per keystroke.
- Composer discovery keeps runtime commands under `/` and skills under `$`; either trigger works at the caret after whitespace. Inline commands are moved to Pi's required leading position only at submission, and `$skill-name` becomes `/skill:skill-name`.
- Workspace skills and extension commands are discovered independently of thread creation, so the fresh-thread composer has the same resource palette as an opened session.
- Composer suggestion lists own their bounded native overflow inside the composer feature. Escape dismisses the current suggestion session; changing the draft or caret reopens discovery. Use the shared Radix `ScrollArea` for explicitly sized panels, not content-sized popups constrained only by `max-height`.
- The rich composer editor preserves native text selection, clipboard shortcuts, and composer-scoped select-all. Rendered skill chips are atomic: selecting or deleting any part operates on the whole skill token.
- Derive presentation values instead of persisting duplicates.
- Unsubscribe from Tauri events during component cleanup.
- Bound rendered history; long sessions need incremental loading or virtualization when measurements justify it.

## File Rule

Prefer cohesive files readable in one pass. Treat 250-350 lines as a review signal and avoid 350+ line source files unless generated, data-heavy, or explicitly justified.
