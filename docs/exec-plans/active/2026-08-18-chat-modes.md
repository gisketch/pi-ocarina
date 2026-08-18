# Chat modes — tickets

Spec: [2026-08-18-chat-modes.md](../../specs/2026-08-18-chat-modes.md)

Status legend: `todo` · `in-progress` · `done`.

Four vertical slices. Each is observable on its own and each leaves the app
green.

---

## M1 — a mode reaches the model — `done`

**Delivers.** The reader presses leader `M`, picks `terse`, asks a question, and
the answer comes back in that voice. It is still in that voice twenty turns
later, and after a compaction.

- `src/shared/chat-modes.ts`, pure: `ChatMode` (`id`, `name`, `instructions`),
  `MODE_BOUNDARY` — the fixed sentence the app appends after the reader's prose,
  saying the mode governs how the agent speaks and never what it does — and
  `resolveMode(thread, global, modes)` returning the mode or `undefined`.
- `SHIPPED_MODES`: one entry, `terse`. Seeded on first launch by the same
  `seeded` flag the roles use, so a reader who deletes it does not get it back.
- Catalog version 9: `modes: ChatMode[]`, `preferences.defaultMode?: string`.
  A version 8 catalog migrates with no mode set and the shipped mode seeded.
- `buildResources` appends `[mode.instructions, MODE_BOUNDARY]` to
  `appendSystemPrompt`, after the project's entries and after the LSP line.
  A child session appends neither.
- Overlay `'mode'`, leader `M`, and a `Spotlight` list reusing the model
  picker's shape. A command-palette entry opens the same overlay.

**Acceptance.** Spec acceptance 1, 2, 4, 8, 9.

**Validation.**
- Resolver table: thread set, global set, neither, and a name matching no mode.
- A test that `MODE_BOUNDARY` is present whenever a mode is, and absent when no
  mode is set.
- A test that a child session's `appendSystemPrompt` carries no mode text.
- A catalog migration test from 8, including the seeding flag.
- One live run against pi, long enough to compact, checking the voice holds.
  No unit test proves a model obeyed a system prompt.

**Blocked by.** Nothing.

---

## M2 — the status bar names the mode — `done`

**Delivers.** The bar names the current mode. It shows nothing when none is set.

- A `mode` segment in `Statusbar.svelte`, between the permission chip and the
  LSP chip.
- A pure `modeChip(mode)` returning `null` when unset, on the rule `lspChip`
  already follows.

**Acceptance.** Spec acceptance 3.

**Validation.** Unit tests for the chip: set, unset, and a long name.

**Blocked by.** M1.

---

## M3 — one thread runs a different voice — `done`

**Delivers.** A thread overrides the global default. Its neighbour is
unaffected. The bar marks the thread that has its own.

- A session-scoped override in main, keyed by thread, never written to the
  catalog. The same shape the permission override already uses.
- The picker sets the thread's mode; a "use the default" row clears it.
- The chip marks an overridden thread the way the permission chip does.

**Acceptance.** Spec acceptance 5, 6.

**Validation.** A driver test: two threads, one override, both prompts checked.
A test that a relaunch drops the override.

**Blocked by.** M2.

---

## M4 — modes are the reader's to write — `todo`

**Delivers.** The reader creates a mode, edits its prose, renames it, deletes
it. A thread pointing at a deleted mode falls back to no mode.

- A modes section in Settings, reusing `RolesOverlay` and `RoleForm` — a mode is
  a role minus the tool list and the model.
- Validation on save: a name, and prose that is not empty.
- Deleting the mode a thread or the default points at clears the pointer rather
  than leaving it dangling.

**Acceptance.** Spec acceptance 7.

**Validation.** Parser tests for a malformed modes array. A test that deleting a
referenced mode clears both pointers.

**Blocked by.** M1.

---

## Order

`M1 → M2 → M3`, with `M4` free after `M1`.
