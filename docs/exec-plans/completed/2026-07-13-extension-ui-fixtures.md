# Extension UI Fixtures

## Goal

Make Pi extension notices and runtime prompts independently designable in Cosmos while keeping fixtures on the production components.

## Acceptance Criteria

- Info, warning, and error notices have fixture states.
- Select, confirm, input, and editor prompts have fixture states.
- The thread runtime renders the same extracted components.

## Context Links

- [Frontend architecture](../../architecture/frontend.md)
- [Quality](../../quality.md)

## Steps

- [x] Extract extension notice and prompt presentation.
- [x] Add Cosmos fixtures for every supported state.
- [x] Run focused frontend checks and Cosmos export.

## Validation

- `bun run typecheck:frontend`
- `bun run test:frontend-unit` — 47 passed
- `bun run cosmos:export`

## Decision Log

- Reuse the production runtime UI. Do not maintain fixture-only replicas.
- Keep notice severity mapping framework-free so the Node test lane does not need an SVG loader.

## Progress Log

- 2026-07-13: Added production-backed fixtures and completed validation.
