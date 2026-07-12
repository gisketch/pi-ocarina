# Streaming Tool Call Lifecycle

## Goal

Render Pi tool activity from argument preparation through execution and completion so long-running or content-heavy tools remain visible, progressive, and truthful.

**Delivered behavior:** Pi tool arguments now appear as coalesced preparing rows, file previews and diffs grow in place, bash and extension output stream into one detail, progressive tools auto-expand once, and interrupted tools always settle.

## Context

- [Canonical spec](../../specs/2026-07-12-streaming-tool-call-lifecycle.md)
- [Semantic tool-call renderer](../../specs/2026-07-12-semantic-tool-call-renderer.md)
- [Desktop architecture](../../architecture/desktop.md)
- [Frontend architecture](../../architecture/frontend.md)

## Tickets

### 1. Early lifecycle bridge and one-shot tool activity

**Delivered behavior:** Tool rows appear while Pi is preparing their arguments, then reconcile through execution and completion. A `read`, `grep`, `find`, or `ls` call visibly changes from its active verb to its completed verb without producing duplicate rows.

**Acceptance criteria:**

- The agent host consumes structured accumulated tool calls from Pi assistant updates and emits typed preparation events without parsing raw JSON fragments.
- Preparation, execution, completion, failure, and interruption remain distinguishable across the host/frontend contract.
- Lifecycle updates reconcile by tool-call ID into one semantic row while preserving the last valid partial input and output.
- One-shot built-ins appear before execution with `Reading`, `Searching`, `Finding`, or `Listing`, then settle to their existing completed presentation.
- Missing IDs, names, paths, incomplete arguments, cancellation, and malformed partial messages fall back safely and cannot leave a permanently active row.
- Transient preparation state remains view-only; reloading uses Pi's final persisted messages.

**Validation:** Agent-host lifecycle contract tests; frontend reconciliation and one-shot adapter tests; frontend and agent-host typechecks; live `read` smoke proving one row from preparation through completion.

**Blocked by:** None.

### 2. Progressive write and edit previews

**Delivered behavior:** Long `write` and `edit` calls appear while the model drafts them. Their file preview or diff grows in place, auto-expands once, and remains available in its final state after execution.

**Acceptance criteria:**

- `write` progresses through `Drafting` → `Writing` → its correct completed verb without implying that draft content is already durable.
- `edit` progresses through `Preparing changes` → `Editing` → `Edited`.
- Valid partial path, content, and edit fields update the existing bounded preview or diff; incomplete fields preserve the last valid presentation or generic fallback.
- Progressive details auto-expand once when useful content first appears.
- Manual expand/collapse wins after the initial automatic expansion; later deltas and completion do not override it.
- Completion does not auto-collapse the final preview, and cancellation settles accessibly without mutating files outside Pi's built-in execution.
- Large content remains coalesced, truncated, scroll-bounded, and responsive.

**Validation:** Partial write/edit adapter tests; disclosure-state tests; malformed and large-content tests; Cosmos phase fixtures; frontend typecheck, unit tests, build, and Cosmos export; live long-write and edit smoke.

**Blocked by:** Ticket 1.

### 3. Progressive bash and extension execution output

**Delivered behavior:** Bash displays its command during preparation, auto-expands once execution output arrives, and streams stdout/stderr into the same terminal detail. Generic extension tools receive the same lifecycle behavior whenever Pi supplies partial updates.

**Acceptance criteria:**

- `bash` progresses through `Preparing` → `Running` → `Ran` or failed while keeping one tool row.
- Pi's bash update callback is the only source of execution output; React does not poll processes or files.
- Partial terminal output replaces the existing bounded detail in place with preserved whitespace, horizontal scrolling, truncation, and no duplicate transcript output.
- Bash auto-expands once when progressive output becomes useful; manual disclosure state and completed disclosure state are preserved.
- Unknown extension tools reconcile partial input/output through the generic adapter without executable extension UI or raw JSON.
- Commands that buffer output still show an active running state and complete correctly when their final result arrives.

**Validation:** Bash lifecycle and output-replacement tests; generic extension partial-update tests; disclosure tests; Cosmos fixtures for streaming, empty, failed, buffered, truncated, and malformed output; full frontend/agent-host checks; live bash and one extension-tool smoke.

**Blocked by:** Ticket 1.

## Validation

- Complete each ticket's focused checks before unblocking dependents.
- After Tickets 2 and 3, run lint, strict typechecks, frontend and agent-host tests, production build, Cosmos export, and the canonical desktop smoke sequence.
- Confirm cancellation, reload, keyboard disclosure, reduced motion, and large-preview bounds at the public UI seam.

## Decision Log

- 2026-07-12: Use three vertical slices: lifecycle foundation plus one-shot activity, file previews, then command/extension streaming.
- 2026-07-12: Tickets 2 and 3 are independent after Ticket 1.
- 2026-07-12: Stream structured accumulated arguments, not raw JSON deltas.
- 2026-07-12: Keep Pi's built-in file mutations one-shot and treat previews as proposed content.
- 2026-07-12: Auto-expand once and preserve subsequent user disclosure choices.

## Progress Log

- [x] Ticket 1: Early lifecycle bridge and one-shot tool activity.
- [x] Ticket 2: Progressive write and edit previews.
- [x] Ticket 3: Progressive bash and extension execution output.

- 2026-07-12: Frontend and host contract tests, strict typechecks, lint, production build, Cosmos export, Sonata/context checks, browser fixture QA, and the four-case Tauri desktop smoke passed.
- 2026-07-12: Desktop smoke cleanup was hardened so temporary workspaces cannot accumulate in the user's catalog.
