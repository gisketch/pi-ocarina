# Cosmos Component Catalog

## Goal

Add a local React Cosmos catalog for Pi Ocarina's real shared atoms and AI chat components.

## Acceptance

- `bun run cosmos` opens the catalog with application styles.
- Atomic fixtures cover buttons, form controls, dropdowns, badges, cards, tabs, dialogs, and tooltips.
- AI fixtures cover sidebar, composer, user/assistant bubbles, tool calls, and rendered markdown.
- Fixtures use deterministic fake data and no native calls or user sessions.

## Steps

- [x] Add Cosmos configuration and scripts.
- [x] Extract only presentational chat pieces already embedded in the runtime.
- [x] Add atomic and AI fixtures.
- [x] Validate fixture discovery, TypeScript, unit tests, and production build.

## Follow-up

- [x] Install and configure the Vite renderer plugin so Cosmos connects to its renderer.
- [x] Wrap fixtures in the existing `TooltipProvider`.
- [x] Cover the remaining public `shared/ui` visual exports with Matrix, Layout, and Icons fixtures.
- [x] Hide the deferred thread search field while retaining the query/filter seam.
- [x] Add the macOS overlay titlebar and persisted sidebar toggle.
