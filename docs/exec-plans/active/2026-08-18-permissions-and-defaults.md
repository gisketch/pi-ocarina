# Permission levels and defaults — tickets

Spec: [2026-08-18-permissions-and-defaults.md](../../specs/2026-08-18-permissions-and-defaults.md)

Six vertical slices. Each one is observable on its own and each leaves the app
green. `A1`–`A3` are the levels; `B1`–`B3` are the settings around them.

---

## A1 — Auto is the default, and main enforces it

**Delivers.** A fresh install edits files in the workspace and runs `pnpm test`
without a prompt, and still asks about `rm -rf build`, `git push`, and a write
to `.env`.

- `src/shared/permissions.ts`, pure: `PermissionLevel`, `resolveLevel`, the
  protected-path test, and the `auto` bash rule.
- Catalog version 8: `preferences.defaultPermission`, and `permission?` on a
  workspace entry. A version 7 catalog migrates to `auto` everywhere.
- `ApprovalGate.request` resolves the level and consults the rule before it
  emits an approve card.

**Acceptance.** Spec acceptance 1, 2, 3, 5, 6, 10.

**Validation.** Unit tests per clause of the bash rule; the protected-path cases
including `..` and `.gitignore`; a resolver table; a gate test per level; a
catalog migration test from 7.

**Blocked by.** Nothing.

---

## A2 — The level is visible, and the workspace can set it

**Delivers.** The status bar names the level. Workspace Settings has a row that
changes it, and switching to Full Access asks first.

- Status bar chip: `auto` dim, `ask` plain, `full` in the accent colour.
- A row in Workspace Settings, cycling `inherit → ask → auto → full`.
- The confirm gate on the way into `full`, naming what changes.

**Acceptance.** Spec acceptance 4, 6.

**Blocked by.** A1.

---

## A3 — A thread can override its workspace

**Delivers.** One thread runs at a different level from its neighbour, and
returns to the workspace's level after a relaunch.

- Session-scoped override in main, keyed by thread. Never written to the catalog.
- The chip shows the thread's level when it has one of its own.

**Acceptance.** Spec acceptance 7.

**Blocked by.** A2.

---

## B1 — Workspace Settings gets its own key

**Delivers.** `<` in NORMAL and `S` on the leader open Workspace Settings.
Global settings no longer nests it; it names the key instead.

**Acceptance.** Spec acceptance 8.

**Blocked by.** Nothing. Independent of A1–A3.

---

## B2 — Global defaults for a new thread

**Delivers.** Settings holds a default model and a default reasoning level, and
a new thread opens on them.

- `preferences.defaultModel`, `preferences.defaultReasoning`. "pi's choice" and
  "model default" are values, not absences.
- Applied when a thread is created, never afterwards.

**Acceptance.** Spec acceptance 9, first half.

**Blocked by.** A1 (catalog version 8 lands there).

---

## B3 — The model picker acts on one thread, and says so

**Delivers.** Changing one thread's model leaves its neighbour alone, the picker
names the thread it is changing, and a thread's model is readable without
opening the picker.

**Acceptance.** Spec acceptance 9, second half.

**Blocked by.** B2.
