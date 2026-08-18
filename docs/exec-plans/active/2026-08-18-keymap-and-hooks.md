# Keys, hooks and authored policy — tickets

Spec: [2026-08-16-keymap-and-hooks.md](../../specs/2026-08-16-keymap-and-hooks.md)

Status legend: `todo` · `in-progress` · `done`.

Seven slices. `K1` is prefactoring that genuinely unlocks the rest: all three
capabilities read from one file, and building three loaders would be building
the same thing three times.

---

## K1 — one configuration file, read and reported — `todo`

**Delivers.** `~/.piocarina/config.json` is read at launch. A malformed file
raises a banner naming the line and the app starts on defaults. Nothing yet
reads its contents.

- `src/shared/config-file.ts`, pure: the shape, and a parser that validates
  per section and per entry. A bad entry is dropped with a reason; its
  neighbours survive.
- Main reads the file once at launch and hands the renderer a parsed result plus
  a list of problems. The app never writes it.
- Problems surface in the existing banner, and again in Settings so they can be
  read after the banner is dismissed.

**Acceptance.** Spec acceptance: a malformed configuration file names the
problem and falls back to defaults.

**Validation.** Parser tests: absent file, empty file, invalid JSON, an unknown
section, a valid section with one bad entry, and a file that is entirely valid.

**Blocked by.** Nothing.

---

## K2 — keys come from the file — `todo`

**Delivers.** The reader rebinds `j`, restarts, and the new key moves the band.
`Escape` cannot be rebound. A collision is reported and both bindings drop.

- The keyboard reducer takes a keymap as an argument. It stays pure: the map is
  an input, never a lookup performed inside it.
- The shipped bindings become the default map, one table rather than literals
  spread through `keyboard.ts`.
- Mode-entry keys and `Escape` are refused at parse time, with a reason that
  says why: an app you cannot leave is not recoverable by editing a file it is
  holding the keyboard for.
- `KeymapOverlay` renders the map in force, not the shipped one.

**Acceptance.** Spec acceptance 1, 2.

**Validation.** Reducer tests over a custom map: a rebound NORMAL key, a rebound
READ key, a rebound leader chord, an unknown action name, a collision, and an
attempt to rebind `Escape`.

**Blocked by.** K1.

---

## K3 — a hook runs, and the ledger says so — `todo`

**Delivers.** A `turn.end` hook runs `pnpm test` when a turn finishes, and its
row appears in the ledger with the output inside it.

- `hook` joins `ToolKind`, not in `GROUPABLE`. An icon in the registry.
- A runner in main: spawned without a shell, cwd is the workspace, output
  captured and bounded, exit code recorded.
- The turn's footer waits for `turn.end` hooks up to a timeout before it settles,
  so the result lands in the turn it belongs to.

**Acceptance.** Spec acceptance 3.

**Validation.** Runner tests: success, non-zero exit, missing binary, and output
larger than the bound.

**Blocked by.** K1.

---

## K4 — a hook cannot take the app down — `todo`

**Delivers.** A hook that hangs is killed at its timeout and reported. The turn
finishes either way. A hook that fails does not fail the turn.

- A timeout per hook, killed on expiry, reported as timed out rather than
  silently dropped.
- Failures never propagate into turn state.
- The remaining points land: `turn.start`, and `edit.after` firing once per turn
  after the last edit rather than once per file.

**Acceptance.** Spec acceptance 3, 4.

**Validation.** A hook that sleeps past its timeout. A hook that fails at
`turn.start`, proving the turn still runs. A turn with three edits, proving
`edit.after` fires once.

**Blocked by.** K3.

---

## K5 — a rule stops the prompt — `todo`

**Delivers.** The reader writes a rule allowing `pnpm test`, and the twentieth
run does not ask. The ledger still records that it ran.

- Rules parsed from the file: global, and per workspace by path.
- `ApprovalGate` consults them after the level and before it emits a card.
  Deny beats allow. The union is evaluated, not the first match.
- A rule may only widen `ask` and `auto`. It can never cover a protected path.

**Acceptance.** Spec acceptance 5.

**Validation.** A rule that matches, one that does not, a deny beating an allow,
a workspace rule not leaking to another workspace, and a rule attempting to
allow a write to `.env` — which must still raise a card.

**Blocked by.** K1.

---

## K6 — the reader can see the rules that are running — `todo`

**Delivers.** Settings lists the rules in force, global and workspace, and marks
which file each came from. A rule that was refused says why.

- Read-only, on the same principle as the project inventory: the app shows what
  it loaded and does not author it.

**Acceptance.** Supports acceptance 5 and 6 by making a silent rule visible.

**Validation.** A rendering test with rules from both levels and one refused.

**Blocked by.** K5.

---

## K7 — reload the configuration without restarting — `todo`

**Delivers.** The reader edits the file, runs `/reload`, and the new keys, hooks
and rules take effect. Refused mid-turn.

- Extends the `/reload` command from the project-surface plan to cover this file
  too, so one command means "re-read what is on disk".

**Acceptance.** Supports acceptance 1 by removing the restart.

**Validation.** A test that a rebound key works after a reload. A test that a
mid-turn reload is refused.

**Blocked by.** K2, K5, and P4 in
[the project-surface plan](2026-08-18-project-surface.md).

---

## Order

`K1` first. Then `K2`, `K3`, `K5` in parallel. `K4` after `K3`, `K6` after `K5`,
`K7` last.
