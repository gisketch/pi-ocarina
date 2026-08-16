# Rebindable keys, hooks, and authored policy

Status: **NEED GRILLING.** High-level. Not an approved contract.

Three small capabilities that share one property: each lets a person change what
the app does without changing its source. They are specified together because
they answer the same question — where does user configuration live, and who
validates it — and should not answer it three different ways.

## Problem

**Keys.** Every binding is fixed in `src/renderer/src/lib/keyboard.ts`. The
bindings suit one person, who chose them. A second user cannot change one.

**Hooks.** Nothing can run when a turn ends. A formatter after an edit, or a test
run after a turn, has to be asked for by hand every time.

**Policy.** `B4` enforces approvals, but the rules cannot be written in the app.
A reader who approves the same command for the twentieth time has no way to say
"always".

## Desired outcome

One configuration seam. Keys, hooks, and approval rules all read from it, and a
bad entry in any of them fails loudly and locally, never silently.

## In scope

- Rebinding any key, with the current bindings as defaults.
- Running a shell command at named points in a turn's life.
- Writing allow and deny rules for tool approvals.
- Where all three live on disk, and what happens when they are wrong.

## Out of scope

- An OS-level sandbox. That is pi's layer, not the harness's.
- A visual editor for any of the three in the first slice.
- Hooks that can change what the agent does. A hook observes and reacts.
- Sharing configuration between machines.

## Acceptance behavior

- A user rebinds a key, restarts, and the new binding works.
- A binding that collides with another is reported, and the app still starts.
- A hook runs at its point, and its failure does not stop the turn.
- A hook that hangs does not hang the app.
- An approval rule stops the prompt for a command it covers, and the ledger still
  records that the command ran.
- A malformed configuration file names the problem and falls back to defaults.

## Constraints

- The keyboard reducer is pure and tested as pure. Configuration is an input to
  it, never a side effect inside it.
- Hooks run in the main process. The renderer never spawns a process.
- A hook command is untrusted input from a file. It runs through the same care
  the terminal column already takes.
- Approval rules widen what runs without asking. The default stays "ask".

## Validation

- Reducer tests over a custom keymap, including a collision and an unknown action.
- Hook tests: success, non-zero exit, timeout, and missing binary.
- Approval tests: a rule that matches, one that does not, and a deny that wins.

## Questions the grill must answer

1. One configuration file for all three, or one each?
2. Which points does a hook get: turn start, turn end, after edit, after tool?
3. Can a hook block a turn, or only observe it? Blocking makes it a policy.
4. Are approval rules per workspace, per repository, or global?
5. Does rebinding cover modal keys, leader chords, and READ keys, or only the
   NORMAL bindings?
6. Does a hook's output belong in the ledger, in a toast, or nowhere?
