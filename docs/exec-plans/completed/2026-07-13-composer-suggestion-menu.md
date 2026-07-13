# Composer Suggestion Menu

## Goal

Make slash-command and skill suggestions a bounded, non-overlapping, scrollable popup with reliable pointer and keyboard navigation.

## Acceptance criteria

- Long suggestion lists stay inside one popup above the composer.
- Overflow scrolls without covering the composer or footer controls.
- Arrow-key selection remains visible while navigating.
- Short command, skill, and file-mention lists keep working.

## Context links

- [Frontend architecture](../../architecture/frontend.md)
- [Quality checks](../../quality.md)
- [`Composer`](../../../src/features/composer/composer.tsx)
- [`ScrollArea`](../../../src/shared/ui/scroll-area.tsx)

## Steps

- Reproduce and measure the long-list failure at the Cosmos fixture seam.
- Replace the broken height/overflow ownership with one explicit composer suggestion-menu boundary.
- Preserve a long-list fixture and validate pointer, wheel, and keyboard behavior.

## Validation

- Cosmos browser inspection for bounds, overflow, wheel, and selected-item visibility.
- Focused frontend lint and typecheck.
- Cosmos export and frontend build.

All validation passed. The existing Vite chunk-size warning remains unchanged.

## Decision log

- 2026-07-13: Keep suggestion popup sizing and navigation in the composer feature; do not change the shared Radix scroll primitive for a content-sized popup it does not natively model.
- 2026-07-13: Use native `overflow-y: auto` for command, skill, extension, and file suggestions; keep Radix for fixed-height scroll panels.

## Progress log

- 2026-07-13: Confirmed the prior absolute-position fix; investigating the remaining viewport sizing failure.
- 2026-07-13: Confirmed Radix viewport height matched its full 648px content while the root was capped at 288px, causing paint-through and no scroll range.
- 2026-07-13: Added the feature-owned listbox, keyboard visibility, ARIA linkage, and a long-list Cosmos fixture. Browser checks pass for long skills and short slash commands.
- 2026-07-13: Focused lint, frontend typecheck, Cosmos export, frontend build, and Sonata structure checks passed. Plan completed.
