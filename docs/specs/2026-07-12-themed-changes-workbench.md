# Themed Changes Workbench

## Problem and Desired Outcome

The existing Changes surface is a fixed-width card inside the chat column. It uses generic card styling, manual narrow/widen buttons, a flat file list, and raw unified-diff text. It does not feel integrated with the sidebar, transcript, tool cards, or titlebar.

Replace it with a collapsible, mouse-resizable review pane docked to the right of chat. The pane must use Pi Ocarina's theme tokens and reuse the same bounded editor diff rendering as file tool calls. The supplied image is a layout reference only; its colors, typography, and exact controls are not a visual specification.

## In Scope

- A right-side Changes pane beside chat, collapsed by default.
- A top-right titlebar icon button that opens and closes the pane and exposes its pressed state.
- The existing Changes keyboard shortcut and tool-call filename navigation.
- Pointer and keyboard resizing through the existing resizable-panel primitive.
- Persisting the last review-pane width through the existing panel-layout preference.
- A themed editor area with unified diff rows, syntax highlighting, old/new line numbers, selected-file metadata, and addition/deletion totals.
- A compact hierarchical file tree for changed files, with folders, status, selection, filtering, and independent scrolling.
- Preservation of the existing Files mode, reviewed state, binary-file handling, loading, empty, and error states inside the new pane.
- Cosmos fixtures for the reusable editor diff and compact tree, plus the composed Changes pane.

## Out of Scope

- Editing files from the diff.
- Staging, unstaging, committing, reverting, or resolving merge conflicts.
- Filesystem watching or live Git refresh while the pane remains open.
- Side-by-side diff mode, minimaps, blame, diagnostics, or a full code editor dependency.
- Copying the reference image's palette, file-type badge style, or omitted-context controls.
- Persisting whether the pane was open across application launches.
- Creating a general-purpose tree framework before another feature needs one.

## Acceptance Criteria

- The Changes control appears at the far right of the window titlebar, remains outside the draggable region, and can be operated by pointer or keyboard.
- Activating the control, using the existing shortcut, or activating a tool-call filename opens the right pane. Activating the titlebar control again closes it.
- Opening from a tool call selects that changed path when available. If it is unavailable, the pane opens without crashing and presents the normal empty or first-file selection.
- The pane and chat share the available width. The pane never overlays the composer or transcript at supported desktop widths.
- Dragging the separator resizes the pane smoothly within safe minimums for both chat and review content. The separator has a visible focus state and keyboard resizing supplied by the shared primitive.
- The last completed width is persisted without sending native persistence calls for every pointer movement.
- Opening and closing use shared motion tokens and respect reduced-motion preferences.
- The pane background, borders, selected rows, hover effects, typography, status colors, icons, and noisy surfaces come from existing theme tokens and shared UI behavior. It introduces no standalone color palette.
- Changes mode shows a compact hierarchy derived from changed paths. Folders can expand and collapse, matching paths remain discoverable through filtering, and the selected file is visibly distinct.
- The selected file renders as a bounded, horizontally and vertically scrollable unified diff with syntax highlighting, old/new line numbers, full-row addition/deletion tinting, and `+N`/`-N` totals. Raw Git headers and hunk markers do not render.
- Binary, empty, malformed, loading, and failed diff responses show readable themed states rather than raw protocol data or a broken editor.
- Tool-call `edit` and `write` details use the same editor-diff renderer in compact density. The Changes pane uses its workbench density; diff parsing and syntax colors do not diverge between them.
- Files mode retains workspace browsing and reviewed toggling, but uses the same compact tree and editor surface rather than the previous generic card layout.
- The file tree and editor scroll independently, and resizing or selecting a file does not reset chat scroll position.
- The editor/file-tree split has bounded minimum and maximum widths, can be resized by pointer or keyboard, and the file tree can be hidden and restored from the workbench header.
- Changes and Files use the shared button-styled Tabs primitive. Header actions remain in a reserved non-shrinking area and never overlap the tab labels.
- Closing and reopening during the same workspace session preserves the selected mode and path when they remain valid.

## Implementation Constraints and Settled Decisions

- The shell owns whether the review pane is open because the toggle lives in the global titlebar. The review feature owns changed-file loading, mode, filtering, selection, and editor state.
- This spec deliberately supersedes the current two-column-shell restriction for the Changes feature only. Changes remains collapsible and is not a permanently visible navigation column.
- Use the installed resizable-panel primitive. Remove manual narrow/widen controls; do not add another resizing or animation dependency.
- Keep the existing typed Tauri commands for repository changes, file diffs, workspace files, file reads, reviewed state, and panel layout. Expand a contract only if implementation evidence proves the current response cannot support the accepted behavior.
- Normalize both Git unified-diff data and tool-call edit/write data into one bounded editor-diff presentation model before rendering.
- Share editor diff/code rendering because tool cards and the workbench are proven consumers. Keep the compact file tree inside the review feature until an unrelated feature proves a shared primitive is needed.
- Reuse the existing bounded syntax-highlighting path and registered languages. Unknown extensions render safely as plain text; no automatic language detection is added.
- Parse and render large diffs within explicit line/content bounds. Truncation must be visible, and highlighting must occur only after bounding.
- Use shared buttons, inputs, icons, scroll areas, hover fields, focus behavior, theme tokens, and font roles. Departure Mono remains the editor/tool-card code face unless the global theme later changes it.
- The workbench layout places the editor on the left and the compact file tree on the right, matching the reference's information hierarchy. The outer workbench itself remains the right-hand pane beside chat.
- The inner editor/tree split reuses the same resizable-panel primitive as the outer chat/workbench split. Do not maintain a separate fixed-width CSS grid.
- Pane width persists; open/closed state does not. A fresh application launch starts with Changes collapsed.

## Validation Evidence

- Focused unit checks cover unified-diff normalization, line numbering, stats, truncation, malformed input fallback, and changed-path tree construction/filtering.
- Component fixtures cover empty, loading, error, binary, selected, long-path, deep-tree, compact tool-card, and full workbench states.
- A frontend integration check proves titlebar toggle, shortcut, tool-call navigation, selection preservation, collapse, and resize behavior.
- Frontend typecheck, lint, unit tests, production build, and Cosmos export pass.
- A real desktop smoke run confirms native resizing, persisted width, titlebar drag behavior, independent scrolling, and theme consistency in the Tauri WebView.

## Risks and Open Questions

- Unified diff responses may contain headers, hunks, renames, mode changes, or malformed lines. Normalization must degrade to readable plain content instead of rejecting the entire file.
- Deep repositories and large diffs can make eager tree construction or highlighting expensive. Bound the rendered diff first; add virtualization only if measurements show it is needed.
- The current titlebar and thread state live at different ownership levels. The implementation must add a narrow state/callback seam rather than moving review data into the application shell.
- No product decision remains open for the first implementation slice.
