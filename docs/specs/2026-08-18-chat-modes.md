# Chat modes — how the agent talks to you

Status: **GRILL IN PROGRESS.** Not an approved contract.

## Problem

The reader wants a durable voice: terse, or plain, or formal. Today the only way
to ask is a message. A message decays. Twenty turns of tool output push it out
of the model's attention, and compaction can drop it. The reader types the same
instruction again.

A skill has the same defect. A skill is invoked once, as a message.

## Desired outcome

The reader names a voice once. Every turn in that thread uses it, however long
the thread runs, and however many times it compacts.

## Why the system prompt

`appendSystemPrompt` is re-sent whole on every request. It survives compaction.
That is the difference between a mode and a message, and it is the reason this
is a feature rather than a habit.

The seam exists. [session-extensions.ts](../../src/main/session/session-extensions.ts)
already passes an array of prose entries: a child's role instructions, and the
LSP's language line. A mode is one more entry.

## Settled decisions

### A chat mode is its own concept, not a role — 2026-08-18

`AgentRole` keeps its meaning: what a child agent is, and which tools it may
touch. A mode is ambient, applies to the thread the reader is reading, and
scopes voice only.

Shared machinery, separate concept: the same editor primitive and the same
`appendSystemPrompt` seam, a distinct list and a distinct word.

Rejected: reusing `AgentRole` with an empty tool list. It costs the word. Every
later sentence would have to say which kind of role it meant.

Open, and the strongest argument against this decision: the reader reads a
child's final message, so a mode arguably belongs on children too.

### The status bar names the mode — 2026-08-18

A mode is invisible everywhere else, which is the bar's own test for what it
carries.

### Global default, thread override, no workspace level — 2026-08-18

Two levels, not the three that permissions resolve across. The symmetry is
broken on purpose.

A permission level is about the code the agent touches, and code is
workspace-shaped. A voice is about the person reading, and that person does not
change between repositories. A workspace level would store the same value twice
and add a branch to the resolver for a row nobody edits.

The thread override earns its place: one thread can widen the voice while the
reader is pairing or wants one long explanation.

Reversible at the cost of a catalog version bump if a workspace level is ever
wanted.

### Leader `M` opens a picker — 2026-08-18

Leader `M`, and a command-palette entry. Not a cycle.

`p` cycles because permission has four fixed levels, and a reader learns a short
fixed order. Modes are an open list, so a cycle would make the reader press the
chord once per mode and read the status bar each time. A picker also shows what
each mode does; a cycle shows only a name.

The overlay reuses the spotlight primitive the model picker already uses.

Not `v`: bare `v` is the vim letter for a visual selection, and a block-level
selection may want it later. Two meanings in one which-key bar teach badly.

### A mode stops at the thread — 2026-08-18

A child never gets the mode's prose. Its final message stays plain.

A child's final message has one consumer, and it is not the reader.
`CHILD_PREAMBLE` states this: the parent reads that message and cannot see the
transcript. A voice trades completeness for reading speed, which helps a person
and does nothing for a parser. A compressed scout report loses the paths and
line numbers the parent needs.

Accepted cost: a peek under a subagent call reads plain while the rest of the
app carries the mode.

This also avoids a contradiction. A mode saying "be terse" would fight
`CHILD_PREAMBLE`, which says to put everything in the last message. Two
instructions in one system prompt, and the model picks the winner.

Open, and superseded by this decision unless it is revisited: the reader does
read a child's final message in the ledger.

### The catalog stores modes, and a project cannot ship one — 2026-08-18

Modes live in the catalog and are edited in settings, on the path roles already
take. A mode is a role minus tools, so the form, the validation and the
persistence exist.

A project may not ship a mode. This follows the decision to have no workspace
level: a voice belongs to the reader, not to the repository, and a repository
that could set it would decide how the app talks to a person who never asked.

Accepted cost: a mode cannot go in git, be diffed, or move to a second machine.
That matches the keymap-and-hooks spec, which already puts sharing
configuration between machines out of scope. If it changes, it should change for
keys, hooks and modes at once.

If a file source is ever wanted, pi's `loadSkillsFromDir` is the pattern, and
adding one later does not invalidate the catalog.

### "Normal" is the absence of a mode — 2026-08-18

No mode selected means the app appends nothing, which is pi's stock behavior.

A `normal` mode carrying prose would be a positive instruction. It would cost
tokens on every request and push the model away from stock, which is the
opposite of what its name promises.

The status bar shows no chip when no mode is set, on the rule `lspChip` already
follows: it returns `null` rather than saying "off".

### One mode ships: `terse` — 2026-08-18

Owner decision. One shipped mode, fusing the caveman and Simplified Technical
English styles into a single voice: no filler, no articles that carry nothing,
active voice, short sentences, one idea per sentence, and every technical term,
identifier and error string kept exact.

The recommendation had been three neutral examples, on the reasoning that
`DEFAULT_ROLES` ships four to teach a shape and that a shipped default reads as
the app's own voice. Overruled: the owner wants the mode they actually use, and
one working example teaches the shape as well as three.

Name is provisional.

### The mode goes last, and the app bounds it — 2026-08-18

The mode's prose is appended after the project's instructions. Later text in a
system prompt wins weakly, and the mode is the more recent and more specific
instruction.

The app then adds a fixed sentence the reader's prose cannot remove, exactly as
`CHILD_PREAMBLE` is added to every role: the mode governs how the agent says
things, never what it does, and never which steps it takes.

The hazard this closes is not a formatting clash. It is a voice instruction
bleeding into behavior — "drop everything unnecessary" read as permission to
skip a verification. A setting named for voice must not be able to change what
the agent does.

The shipped `terse` mode is written to that boundary: it constrains sentences,
not work.

Accepted cost: the fixed sentence costs tokens on every request, and it
forecloses a mode that wants to change behavior. That belongs to a hook or a
role.

## In scope

- A named, editable mode: a name and a block of prose.
- One global default, and a per-thread override.
- Leader `M`, a picker overlay, and a command-palette entry.
- A status-bar chip naming the current mode.
- One shipped mode, `terse`.

## Out of scope

- A workspace level.
- A mode on a subagent.
- A mode a project ships, or a mode stored as a file.
- A mode that changes what the agent does rather than how it says it.
- Sharing modes between machines.

## Acceptance behavior

- The reader sets a mode, sends twenty turns, and the twentieth answer still
  carries the voice.
- The voice survives a compaction.
- The status bar names the mode, and shows nothing when no mode is set.
- Leader `M` opens the picker. The palette offers the same thing.
- One thread's override leaves its neighbour on the global default.
- A thread with an override keeps it until the app restarts.
- A mode is created, renamed and deleted in settings, and the thread reading a
  deleted mode falls back to no mode rather than failing.
- A subagent's final message is unaffected by the mode.
- A mode telling the agent to skip a step does not make it skip the step.

## Validation

- A unit test that the resolver returns the thread override, then the global
  default, then nothing.
- A test that the fixed boundary sentence is present whenever a mode is, and is
  not present when no mode is set.
- A test that a child session's `appendSystemPrompt` carries no mode.
- A catalog migration test.
- One live run against pi, long enough to compact, checking the voice holds.
  The seam is a system prompt, and no unit test proves a model obeyed it.

## Risks

- The voice is a request, not a guarantee. A model can ignore a system prompt.
  The app can prove the text was sent; it cannot prove the model complied.
- The status bar now carries six segments.
- The boundary sentence is prose, so it is defence in depth, not enforcement.
