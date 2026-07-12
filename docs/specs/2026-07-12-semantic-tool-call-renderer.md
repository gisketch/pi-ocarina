# Semantic Tool Call Renderer

## Problem and Desired Outcome

Tool calls currently show the tool name, status, and serialized input or output. This exposes protocol-shaped JSON, consumes too much transcript space, and makes common actions difficult to scan.

Tool calls should read like concise activity: `Edited filename.ts`, `Read filename.ts`, or `Ran bun run build`. Expanding a row should reveal a purpose-built visual for the action rather than raw JSON.

## In Scope

- One compact, expandable tool-call row shared by built-in and extension tools.
- Distinct running, completed, and failed states with accessible labels and shared icons.
- App-owned adapters for Pi built-ins:
  - `edit`: `Edited {filename}` with an editor-style unified diff.
  - `write`: `Created {filename}` or `Updated {filename}` with an addition diff or file preview.
  - `read`: `Read {filename}` with a read-only code viewer.
  - `bash`: `Ran {command}` with terminal-style output.
  - `grep`, `find`, and `ls`: concise query/path summaries with readable result lists or terminal-style text.
- A polished generic fallback for unknown tools registered through Pi extensions.
- Cosmos fixtures covering every state, built-in adapter, and the generic fallback.

## Out of Scope

- Reusing Pi terminal `renderCall` or `renderResult` components in React.
- Allowing extensions to provide executable React renderers or unvalidated markup.
- Adding an extension-defined presentation protocol in the first version.
- Replacing the existing agent-host tool lifecycle protocol unless an adapter needs data Pi does not currently forward.
- Full terminal emulation, editable code, or transcript virtualization.

## Acceptance Criteria

- Collapsed tool calls are single semantic rows with a leading status/tool icon and no JSON block.
- Running rows visibly indicate activity and announce `running`; completed rows show a stable success icon; failed rows show a destructive icon and `failed` state.
- Status changes reconcile in place by tool-call ID without creating duplicate rows or losing the original input.
- Expanding `edit` or `write` shows a bounded, syntax-aware editor-style diff with additions and deletions visually distinct.
- Expanding `read` shows bounded read-only source content with preserved whitespace and horizontal scrolling where needed.
- Expanding `bash` shows the command and bounded terminal-style output with preserved line breaks; long lines scroll instead of wrapping into unreadable prose.
- Known search/list tools present their meaningful query, path, and results without serialized wrappers.
- Unknown extension tools receive a humanized name, meaningful primitive input fields, and formatted string/list output. Nested unsupported values are summarized safely rather than dumped as JSON.
- Missing, partial, malformed, or streaming tool data never crashes the transcript. The renderer falls back to the generic presentation.
- Expansion is keyboard accessible, exposes its state, retains visible focus, and respects reduced-motion preferences.
- Large details remain scroll-bounded and show an explicit truncation indicator.

## Implementation Constraints and Settled Decisions

- Keep the current `toolName`, `toolCallId`, `status`, `input`, and `output` event boundary as the canonical source.
- Preserve tool input when running updates contain only partial output, and merge the completed result into the same transcript item.
- Select an adapter by normalized tool name. Adapters produce a small presentation model: summary verb, subject, icon, and detail kind/data.
- Render the presentation model through shared row, status, code/diff, and terminal-detail components; adapters do not own layout chrome.
- Use app-owned adapters plus a generic fallback. Future extension tools work immediately through the fallback without registration in Pi Ocarina.
- Treat Pi extension TUI renderers as terminal-only behavior. Do not translate or execute them in the desktop UI.
- Use shared Pixelarticons, typography tokens, colors, and existing disclosure semantics. Do not add a rendering or animation dependency.
- Keep raw protocol values out of the default UI and avoid an unrestricted raw-JSON escape hatch.

## Validation Evidence

- Focused adapter tests prove semantic summaries and detail selection for each built-in tool plus unknown and malformed tools.
- Reconciliation tests prove running-to-completed and running-to-failed updates keep one row and retain input.
- Cosmos fixtures visually cover collapsed and expanded states, long commands, multiline output, diffs, empty results, truncation, and the extension fallback.
- Frontend typecheck, lint, unit tests, production build, and Cosmos export pass.
- A desktop smoke run confirms live Pi `bash`, `read`, `edit`, and one extension tool render and update correctly.

## Risks and Open Questions

- Pi results vary by tool and extension. Adapters must narrow unknown data defensively and fall back instead of assuming one result shape.
- Syntax highlighting and diff generation must remain bounded for large files; the first version may truncate before highlighting.
- ANSI output may be preserved as plain text initially. ANSI color interpretation is a later enhancement unless an existing dependency already provides it safely.
