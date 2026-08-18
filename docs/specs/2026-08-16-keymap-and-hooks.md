# Rebindable keys, hooks, and authored policy

Status: **GRILLED 2026-08-18.** Decisions below were taken by the agent at the
owner's instruction, not asked one at a time. Read them as proposals with
reasons: any of them is cheap to overturn before implementation.

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

## Settled decisions — 2026-08-18

### One file, and the reader owns it

All three live in one JSON file the reader writes by hand:
`~/.piocarina/config.json`. The app reads it and never rewrites it.

The dividing principle is **who edits it owns it**. The catalog is app state:
the app writes it constantly, and a reader who hand-edited it would lose their
work at the next save. Keys, hooks and rules are the opposite — hand-authored,
read at launch, and meaningless for the app to author. Chat modes went in the
catalog for the same reason inverted: they are edited in the app.

One file rather than three because a reader looking for "where do I configure
this" should find one answer, and because all three fail the same way: a bad
entry is reported, its neighbours still load, and the app still starts.

Accepted cost: no in-app keybinding editor, ever, unless the app starts writing
a file the reader owns. The spec already puts a visual editor out of scope.

### Three hook points: `turn.start`, `turn.end`, `edit.after`

Not a point per tool call. A hook on every tool spawns a process per read, and
the reader who wanted a formatter gets a hundred processes a turn.

`edit.after` fires once per turn, after the last edit, not once per file. A
formatter run three times on the same turn is three times the cost for one
result.

Accepted cost: no per-tool observability. A reader who wants to audit every tool
call has the ledger, which already records them.

### A hook observes. It cannot change what the agent does

No hook can veto, delay or alter a turn. A hook that could refuse one is
approval policy, which is the third capability in this spec and has its own
shape.

The app does wait for `turn.end` hooks to finish before the footer settles, up
to a timeout, so their result can be reported in the turn they belong to. The
wait is bounded and a hook that exceeds it is killed and reported as timed out.
A non-zero exit, a missing binary and a timeout are all reported and none of
them fails the turn.

### Approval rules are global and per workspace, and deny always wins

Two levels, unioned, with deny beating allow. No thread level: a rule is a
standing statement about what is safe, and a per-thread exception is what the
approve card already is.

Two levels rather than one because trust is repository-shaped. `pnpm test` is
safe in a repository the reader owns and is not a statement about every
repository on the machine.

**A rule can only widen `ask` and `auto`. It can never cover a protected path.**
Writing `.env` stays a card whatever the file says. A configuration file that
could silently permit that is a configuration file worth attacking, and the
level that permits everything already exists and is named `full access`.

### Every key is rebindable except the ones that change mode

NORMAL, READ, DIFF and leader bindings are all rebindable. `Escape`, and the
keys that enter a mode, are not.

The reason is recoverability. A reader who rebinds `j` has a worse day. A reader
who rebinds `Escape` has an app they cannot get out of, and the fix is editing a
JSON file they cannot open because the app is holding the keyboard.

Accepted cost: a reader on a non-QWERTY layout still cannot move the
mode-entry keys.

A binding that collides with another is reported at launch, both bindings are
dropped rather than one silently winning, and the app starts.

### A hook gets a ledger row

`hook` joins `ToolKind`, beside `skill` and `think`. Its output is the row's
body, collapsed, and a failure marks the row the way a failed tool call is
marked. Not groupable.

The app already has one grammar for "something happened during this turn", and a
hook is one of those things. A toast would be gone before the reader looked, and
nowhere would make a formatter that silently did nothing indistinguishable from
one that never ran.
