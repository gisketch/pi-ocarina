# Semantic Tool Call Renderer

## Goal

Replace protocol-shaped tool-call JSON with compact semantic activity rows and expandable, tool-appropriate details.

## Context

- [Canonical spec](../../specs/2026-07-12-semantic-tool-call-renderer.md)
- [Frontend architecture](../../architecture/frontend.md)

## Tickets

### 1. Semantic tool row and extension fallback

**Delivered behavior:** Every tool call renders as one compact expandable row with running, completed, or failed status. Unknown Pi extension tools receive a polished generic summary and labeled details instead of raw JSON.

**Acceptance criteria:**

- A normalized presentation model selects summary verb, subject, icon, status, and detail kind without trusting unknown input shapes.
- Running, completed, and failed updates reconcile into one row by tool-call ID and preserve the original input.
- The generic fallback humanizes tool names, displays primitive fields and string/list output, summarizes unsupported nested values, and never dumps raw JSON.
- Disclosure is keyboard accessible, focus-visible, reduced-motion safe, scroll-bounded, and explicitly marks truncation.
- Cosmos demonstrates all statuses, malformed data, long data, and an unknown extension tool.

**Validation:** Focused adapter/fallback and reconciliation tests; frontend typecheck; lint; production build; Cosmos export.

**Blocked by:** None.

### 2. File tool presentations

**Delivered behavior:** Pi `read`, `edit`, and `write` calls render as `Read`, `Edited`, `Created`, or `Updated` file activity with expandable code or diff visuals.

**Acceptance criteria:**

- `read` expands to a bounded read-only code viewer with preserved whitespace and horizontal scrolling.
- `edit` expands to an editor-style unified diff with distinct additions and deletions.
- `write` distinguishes create from update when the available result permits it, then shows an addition diff or file preview.
- Missing or variant Pi payloads fall back to the generic renderer without breaking the transcript.
- Existing Open in Changes behavior remains available for paths the app can resolve.
- Cosmos covers collapsed/expanded, running/completed/failed, long source, truncation, and malformed payloads.

**Validation:** Focused file-adapter tests; frontend unit tests; typecheck; build; Cosmos export; live `read` and `edit` desktop smoke.

**Blocked by:** Ticket 1.

### 3. Command and discovery tool presentations

**Delivered behavior:** Pi `bash`, `grep`, `find`, and `ls` calls render as concise command/search activity with expandable terminal-style or result-list details.

**Acceptance criteria:**

- `bash` collapses to `Ran {command}` and expands to command plus terminal-style output with preserved lines and horizontal scrolling.
- `grep`, `find`, and `ls` summarize their meaningful query/path and expand into readable results without protocol wrappers.
- Streaming output updates the existing row while preserving the command/input.
- Empty, failed, long, and malformed results remain readable and use the generic fallback where necessary.
- ANSI sequences remain safe plain text in v1; no terminal emulator or new rendering dependency is added.
- Cosmos covers collapsed/expanded, running/completed/failed, multiline output, long lines, empty output, truncation, and malformed payloads.

**Validation:** Focused command/search adapter tests; frontend unit tests; typecheck; build; Cosmos export; live `bash` and one extension-tool desktop smoke.

**Blocked by:** Ticket 1.

## Validation

- Complete the validation listed on each ticket before unblocking dependents.
- After Tickets 2 and 3, run the full frontend check set and live desktop smoke from the canonical spec.

## Decision Log

- 2026-07-12: Use app-owned adapters plus a generic extension fallback; do not reuse Pi terminal renderers.
- 2026-07-12: Keep the existing agent-host tool event contract unless implementation proves required data is absent.
- 2026-07-12: Tickets 2 and 3 are independent after the shared semantic row and fallback land.

## Progress Log

- [ ] Ticket 1: Semantic tool row and extension fallback.
- [ ] Ticket 2: File tool presentations.
- [ ] Ticket 3: Command and discovery tool presentations.
