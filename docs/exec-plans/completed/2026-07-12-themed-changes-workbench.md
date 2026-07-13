# Themed Changes Workbench

## Goal

Replace the inline generic Changes card with a theme-native, collapsible, resizable right-hand review pane that shares bounded editor rendering with file tool calls.

**Delivered behavior:** Changes now opens from the far-right titlebar control, keyboard shortcut, or tool-card filename into a theme-native resizable pane. Git changes and workspace files share a compact hierarchy and bounded syntax-aware editor surfaces with tool cards.

## Context

- [Canonical spec](../../specs/2026-07-12-themed-changes-workbench.md)
- [Frontend architecture](../../architecture/frontend.md)
- [Semantic tool-call renderer](../../specs/2026-07-12-semantic-tool-call-renderer.md)
- [UI increment map](../../architecture/ui-increments.md)

## Tickets

### 1. Shared bounded editor diff

**Delivered behavior:** Tool-call file details and review fixtures render through one theme-native editor surface with bounded syntax highlighting, line numbers, diff stats, and safe fallback behavior.

**Acceptance criteria:**

- One normalized editor model represents code rows, unified diff rows, old/new line numbers, additions, deletions, file identity, and truncation.
- Git unified-diff text is parsed after bounding and tolerates headers, hunks, metadata, malformed lines, and unknown extensions without crashing.
- Existing `edit`, `write`, and `read` tool-card visuals migrate to the shared editor renderer without changing their lifecycle or disclosure behavior.
- Compact density preserves current tool-card scrolling, full-row diff tint, syntax colors, filename navigation, copy behavior, and Departure Mono typography.
- Unknown languages remain escaped plain text; no automatic detection, editor framework, or new highlighting dependency is added.
- Cosmos demonstrates compact code, addition-only write, mixed edit, malformed unified diff, binary/empty fallback, and truncation.

**Validation:** Focused normalization/parser tests; existing tool-presentation and disclosure tests; frontend typecheck; production build; Cosmos export.

**Blocked by:** None.

### 2. Themed review content and compact file tree

**Delivered behavior:** The Changes feature presents a workbench-density editor beside a compact hierarchical tree, with themed Changes and Files modes and preserved review behavior.

**Acceptance criteria:**

- Changed paths build a deterministic folder/file hierarchy with compact rows, folder disclosure, status, selection, filtering, and bounded independent scrolling.
- The selected changed file renders through the shared editor diff with filename, syntax highlighting, line numbers, and `+N`/`-N` totals.
- Files mode uses the same compact tree and editor surface while preserving file reading and reviewed toggling.
- Loading, no changes, no selection, binary, malformed, and native-command failure states are readable and theme-native.
- Selection, mode, folder disclosure, and filter state remain local to the review feature; closing and reopening in the same workspace preserves valid mode/path selection.
- All surfaces use existing background, noisy-surface, border, status, hover, focus, typography, icon, input, button, and scroll tokens without standalone colors.
- Cosmos demonstrates deep paths, long names, filtered results, selected rows, both modes, and every fallback state.

**Validation:** Focused tree construction/filter tests; frontend unit tests; typecheck; lint; production build; Cosmos export; fixture visual inspection.

**Blocked by:** Ticket 1.

### 3. Right review pane and titlebar control

**Delivered behavior:** Changes opens as a collapsible, smoothly resizable pane to the right of chat from the titlebar, keyboard shortcut, or tool-call filename.

**Acceptance criteria:**

- A Changes icon button sits at the far right of the titlebar outside the drag region, exposes pressed state, and opens or closes the pane by pointer or keyboard.
- The shell owns pane visibility through a narrow callback/state seam; review data remains owned by the review feature.
- Chat and review use the existing horizontal resizable-panel primitive with safe minimum sizes, visible/focusable separator behavior, and no overlay over transcript or composer.
- Pane open/close motion uses existing motion tokens and reduced-motion behavior.
- The existing shortcut opens the pane; a tool-call filename opens it and selects the matching path when available.
- Closing and reopening preserves valid mode/path selection during the workspace session and does not disturb transcript scroll.
- The last completed width persists through the existing panel-layout command; dragging does not invoke native persistence continuously.
- Manual narrow/widen buttons and the old inline card placement are removed.
- A fresh app launch starts with Changes collapsed.

**Validation:** Frontend integration check for toggle/shortcut/tool-link/selection/collapse/resize; typecheck; lint; unit tests; production build; Cosmos export; real Tauri desktop smoke for drag regions, pointer and keyboard resizing, persisted width, independent scrolling, and theme consistency.

**Blocked by:** Ticket 2.

## Acceptance Criteria

- All three tickets satisfy their observable behavior and validation before the plan moves to completed.
- The final result satisfies every criterion in the canonical spec without expanding into editing, Git mutation, filesystem watching, or a general tree framework.

## Steps

1. Complete Ticket 1 and keep tool calls green.
2. Complete Ticket 2 against the shared editor seam.
3. Complete Ticket 3 only after the review content is independently fixture-testable.
4. Run the final validation set and move this plan to `completed`.

## Validation

- Run each ticket's focused checks before unblocking the next ticket.
- After Ticket 3, run frontend typecheck, lint, frontend unit tests, production build, Cosmos export, and the real desktop smoke named in the spec.
- Run Sonata and diff checks before final handoff.

## Decision Log

- 2026-07-12: Use three vertical slices: shared editor, review content, shell integration.
- 2026-07-12: Editor rendering is shared immediately because tool cards and Changes are proven consumers.
- 2026-07-12: Compact tree composition remains inside the review feature until an unrelated consumer exists.
- 2026-07-12: Reuse the installed resizable-panel primitive and existing native panel-width preference.
- 2026-07-12: Publish no external tickets because issue tracking is configured as repo-local execution plans.

## Progress Log

- [x] Ticket 1: Shared bounded editor diff.
- [x] Ticket 2: Themed review content and compact file tree.
- [x] Ticket 3: Right review pane and titlebar control.

- 2026-07-12: Shared editor normalization, syntax highlighting, compact/workbench densities, and new-file addition rendering landed with focused tests.
- 2026-07-12: Changes and Files modes migrated to the themed editor plus compact hierarchical tree; Cosmos visual QA confirmed filtering, selection, and layout.
- 2026-07-12: Titlebar toggle, shortcut, tool-link navigation, collapse, native resizing, and persisted width landed through the existing resizable primitive and panel-layout command.
- 2026-07-12: Fixed the E2E harness to use the current Tauri internal invoke seam after the legacy global failed across existing tests.
- 2026-07-12: Full repository check, Cosmos export, Sonata checks, and five real Tauri E2E tests passed.
- 2026-07-12: Narrow-window follow-up replaced impossible pixel minimums with proportional chat/review constraints so opening cannot strand the review pane at zero width.
