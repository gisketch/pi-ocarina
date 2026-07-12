# Streaming Tool Call Lifecycle

## Problem and Desired Outcome

Pi Ocarina currently introduces most tools only after the model has finished generating their arguments. Long `write` and `edit` calls therefore appear idle and then complete suddenly, even though Pi exposes partial tool-call arguments while the model is preparing them. Bash execution output can also update while the command runs.

Tool rows should appear as soon as Pi begins a tool call, update the existing semantic presentation in place, and expose useful progressive details without claiming that proposed file content has already been written to disk.

## In Scope

- Forward Pi tool-call argument lifecycle events from the agent host through the typed desktop protocol.
- Reconcile preparing, executing, completed, and failed updates into one row by tool-call ID.
- Tool-specific active presentations:
  - `write`: stream a growing file preview while drafting, then show writing and completed states.
  - `edit`: stream a growing diff preview while preparing changes, then show editing and completed states.
  - `bash`: stream the command while it is prepared and stdout/stderr while it executes.
  - `read`, `grep`, `find`, and `ls`: appear immediately with an active semantic label, then populate results when their one-shot execution completes.
  - Extension tools: consume execution updates when the extension calls Pi's update callback and otherwise retain the generic fallback.
- Automatically expand progressive `write`, `edit`, and `bash` details once when live content becomes useful.
- Cosmos coverage for progressive arguments, execution output, completion, failure, cancellation, and malformed partial data.

## Out of Scope

- Incrementally writing partial model output to files.
- Replacing or wrapping Pi's built-in file tools.
- Treating a streamed file preview as durable filesystem state.
- Adding a terminal emulator, executable extension renderer, unrestricted raw JSON view, or animation dependency.
- Making `read`, `grep`, `find`, or `ls` stream result data when their built-in Pi implementations only return a final result.

## Acceptance Criteria

- A tool row appears during Pi's tool-call argument stream instead of waiting for tool execution to begin.
- Partial updates preserve one stable row and never duplicate a tool when execution starts or completes.
- User-facing phases remain truthful:
  - `write`: `Drafting {file}` → `Writing {file}` → `Wrote`, `Created`, or `Updated {file}`.
  - `edit`: `Preparing changes to {file}` → `Editing {file}` → `Edited {file}`.
  - `bash`: `Preparing {command}` → `Running {command}` → `Ran {command}`.
  - One-shot tools use active verbs such as `Reading`, `Searching`, `Finding`, or `Listing`, followed by their existing completed verb.
- During argument streaming, expanded `write` content and `edit` diffs grow in place as valid partial fields become available.
- During bash execution, expanded terminal output updates in place from Pi execution updates with preserved whitespace and bounded scrolling.
- Progressive `write`, `edit`, and `bash` details auto-expand once. A user's later disclosure choice wins; subsequent deltas do not force the row open again.
- Completion does not automatically collapse a row. The final disclosure state remains available for inspection.
- Partial, incomplete, reordered, malformed, or unknown tool data never crashes the transcript. The presentation uses the last valid state or the generic fallback.
- Aborted argument generation or execution cannot leave a permanently active row; it settles as interrupted or failed with an accessible status.
- Reloading a thread uses Pi's final persisted messages and does not attempt to persist or reconstruct transient partial previews.
- Existing semantic styling, Departure Mono typography, tokenized status colors, hover treatment, keyboard disclosure, and reduced-motion behavior remain intact.

## Implementation Constraints and Settled Decisions

- Pi remains the source of truth. Transient previews are derived from Pi events; only final Pi session messages are authoritative after reload.
- Consume the structured tool call from each assistant event's accumulated partial message. Do not independently parse raw JSON fragments from `toolcall_delta`.
- Distinguish preparation from execution in the typed protocol. Preparation updates carry partial input; execution updates carry partial or final output.
- Preserve the existing semantic tool presentation model and reconciliation seam. Extend them with lifecycle phase and partial-input tolerance rather than creating a second renderer.
- Pi's built-in `write` and `edit` tools perform one final filesystem mutation and do not emit execution progress. Their live preview represents proposed arguments, not bytes written.
- Pi's built-in bash update callback is the canonical source for live stdout/stderr. Do not poll processes or files from React.
- Coalesce high-frequency argument updates before React rendering and keep all previews within existing truncation and scroll bounds.
- Auto-expansion is view state, not session state. Record whether the automatic expansion has already occurred so user interaction is not overridden.
- Unknown extension tools continue through the generic adapter and may become progressive without app-specific registration when Pi supplies partial input or output.

## Validation Evidence

- Agent-host contract tests prove `toolcall_start`, accumulated argument updates, `toolcall_end`, execution start/update/end, and cancellation produce ordered typed lifecycle events.
- Reconciliation tests prove every lifecycle sequence retains one row, preserves the last valid input/output, and reaches a terminal state.
- File adapter tests prove partial write previews and edit diffs tolerate incomplete arguments and become their final semantic presentation.
- Bash tests prove progressive output replaces the same bounded terminal detail rather than appending duplicate transcript items.
- Disclosure tests prove progressive tools auto-expand once, user collapse is respected, and completion preserves the current disclosure state.
- Cosmos fixtures demonstrate each phase and progressive detail for write, edit, bash, one-shot tools, extensions, malformed data, and reduced motion.
- Frontend and agent-host typechecks, focused unit tests, production build, and Cosmos export pass.
- A desktop smoke run confirms visible progressive `write`, `edit`, and `bash` activity plus one-shot `read` completion against the bundled Pi runtime.

## Risks and Open Questions

- Provider partial-message quality can vary. The adapter must tolerate missing names, IDs, paths, and temporarily incomplete structured arguments.
- Large generated files can cause excessive render and highlighting work. Coalescing, truncation, and incremental presentation must be measured during implementation.
- Some commands buffer their own output, so bash can only display data when the child process emits it.
- No product decision remains open for the first implementation slice.
