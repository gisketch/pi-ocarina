# Spec: Subagents

Status: **APPROVED** (2026-08-17). Grilled to settlement; the decisions below are
the contract. Amend rather than rewrite.

Visual truth: `PiOcarina Components.dc.html` §11 (nested spines, parallel).
Behavior truth: this file.

## Problem & Outcome

The design shows `agent` rows with child tool calls nested one level under them,
and parallel subagents updating as sibling rows. The reducer nests them, the
renderer indents them, and fixtures cover both. Nothing produces them, because
**pi 0.84 has no agent or task tool**, and its tool events carry no parent
reference at all.

So subagents are ours to build. Outcome: the agent hands a scoped piece of work
to one or more child agents, the reader watches each child's tool calls appear
nested under the row that started them, and can peek into any child that is
still running, stop one without stopping the rest, and see afterwards what each
one was, what it cost and how it ended.

## What pi gives us

Verified against `@earendil-works/pi-coding-agent@0.84.2`:

- `pi.registerTool(definition)` registers a custom tool.
- `createAgentSession({ model, tools, sessionManager })` builds a session
  in-process. `SessionManager.inMemory()` gives one with no session file, and
  `tools: [...]` restricts what it may call. pi's SDK documentation names
  "build custom tools that spawn sub-agents" as an intended use.
- `execute(toolCallId, params, signal, onUpdate)` — the first argument is the
  parent row's id, `signal` is an `AbortSignal`, and `onUpdate` publishes partial
  results while the call is still running.
- `ToolDefinition.executionMode: 'parallel'` lets several tools run at once.
- `ToolExecutionStartEvent` has no parent field. The nesting therefore comes from
  **us**: the tool knows its own `toolCallId` and stamps it as `parentId`. The
  vocabulary already carries `parentId`.
- A tool result's `details` is stored in session history but **never sent to the
  model** — the provider payload carries `content` only
  (`pi-ai/dist/api/anthropic-messages.js:838`). Anything put in `details` costs
  disk, not tokens.

For reference, pi's own example extension takes a different route: it spawns
`pi --mode json -p --no-session` per child and parses NDJSON. Decision 1 explains
why this app does not.

## In Scope

The tool definition and its schema; roles and the settings that hold them; how a
child session is created, restricted and cancelled; how a child's events reach
the parent thread as nested rows; the peek; what the parent model receives; how
all of it survives a reopen; and how children are counted.

## Out of Scope

The nesting rule and its rendering (thread-ledger spec, built and tested).
Resumable children — a child cannot be sent back in, by decision 3.

## Decisions

### 1. A child is an in-process `AgentSession`, not a spawned `pi` process

pi's own example extension spawns `pi --mode json -p --no-session`, and we
deliberately do not copy it.

The reason is approvals. Our gate is not pi's — it is an inline extension we
inject when a session is built (`piocarina-approvals`, `session-factory.ts:111`).
A child session built the same way takes the same gate. A spawned process cannot:
it loads pi's own extension directory, and pi's `security.md:29` says
non-interactive modes show no trust prompt, while `security.md:33` says pi ships
no sandbox. A spawned child holding `write` or `bash` would therefore edit the
disk unattended, with no card and no rule — the exact regression this spec's risk
list names first. The only safe subprocess is one restricted to read-only tools
forever, which removes the feature.

Three smaller reasons point the same way. The reducer already nests on `parentId`
and the translator already reads pi's typed tool events, so an in-process child
needs a stamped id and no second event reader. `execute` receives an
`AbortSignal`, which a child session accepts directly, where a process needs
SIGTERM and then SIGKILL mid-write. And usage arrives as events rather than as
text scraped from a pipe.

Accepted cost: a child that crashes the process takes the app with it, where a
subprocess would die alone. This widens a risk we already carry — pi extensions
run in our process today — rather than adding a new one.

### 2. Identity is a role plus a name; the model chooses only the role

A **role** is authored by the user in app settings and carries a system prompt, a
tool set and a default model. The orchestrator names a role, writes the task and
its label, and may override the model or narrow the tools. It never writes a
saved role's system prompt and never picks a name.

Roles rather than inline prompts, because a role is stable and tuned once. Roles
in app settings rather than markdown files in the repository, because a
repo-controlled system prompt is a prompt-injection surface — pi's own example
keeps project agents off by default and prompts before running them, and a
setting the user wrote has none of that problem.

The **name** is drawn by the app from a pool held in settings, defaulting to
Greek myth. It seeds the child's sigil: `identicon(name, hue)` with the
workspace's own hue, so a child reads as belonging to the workspace it runs in.
This is the existing 5x5 mirrored sigil rendered small, not a new grid — the
hash, the mirror and both lightness steps are a locked visual contract with
fixture tests.

### 3. A name lives for one spawn

It is drawn from the names not currently in use, written into the tool call's
record, and released when the task returns.

A name that outlived its child would imply a memory the child does not have: its
context dies at return, so the same name coming back with no recollection would
be a lie. Per-spawn names also replay for free — the name is in the record
already — where a name that persists across a thread needs a stored role-to-name
table. Accepted cost: a three-step chain shows three names for what feels like
one worker, and nobody can send a named agent back in.

### 4. Children are watched in two places: nested rows and a peek

The rows under the spawn call are the record; a peek opened on a focused row is
the monitor. Children never become columns — a column means a thread, and a child
has no session file, cannot be resumed and is not in the catalog, so a column
would behave unlike every other column.

The row is `sigil, name, role, label, live cell`. Everything left of the last
cell is written once and never moves; the last cell holds the child's current
tool call, and is replaced by a status mark and the final duration when the child
settles. The tool schema therefore carries `label` beside `task`: the task is the
child's brief, the label is the row's.

`l` on a focused agent row opens the peek and `h` closes it, shadowing the
thread-left/right movement those keys have elsewhere
(`docs/specs/2026-08-15-shell-navigation.md:47`), in the way `j` and `k` are
shadowed while a question is focused.

### 5. Elapsed time ticks once a second, from one clock

A single interval owns the tick for the whole app, not one per row. It starts
when the first child begins and stops when the last one settles, so an app with
no children runs no timer. It pauses while the window is hidden. Durations are
rendered in tabular figures so a changing number never reflows the row, and the
tick is read in the leaf that draws the duration, so a second passing repaints a
text node rather than a transcript.

### 6. Reopening a thread rebuilds the rows, not the steps

Each child's name, role, label, final status, duration and usage are written into
the spawn call's recorded result, and the rows are rebuilt from them the way a
question card is rebuilt by `ask-replay`. The peek on a replayed row shows the
child's summary rather than its tool calls.

Persisting every child's every tool call was rejected: a child doing sixty calls
would write a second transcript inside the parent's session file, and pi caps its
own subagent output at 50 KB per task for the same reason. Persisting nothing was
rejected because the names and roles are the record. Accepted cost: the peek shows
steps while live and a summary after reopen, which is an inconsistency a reader
will notice.

Storing this in `details` costs disk only — verified above, `details` never
reaches the model.

### 7. The parent receives a structured envelope, one entry per child

Each entry carries the name, the role, the label, a machine-readable status, the
child's final message capped per child, a `truncated` flag when the cap bit, and
the child's usage.

Prose alone was rejected because three concatenated blobs leave the parent
guessing which child said what, and because a child that failed, was denied at
the gate or was cancelled must be distinguishable from one that succeeded
quietly. A forced summary was rejected because it needs either a second model
call per child or a promise from a user-authored role prompt, and nothing
enforces the latter.

Because the entry carries only the final message, **the child is told so**. The
app appends a fixed instruction to every role's system prompt — the user's role
text cannot be relied on to include it — saying that its last message is the
whole of what the parent will read, and that anything the parent needs must be in
it rather than left in the child's own transcript.

### 8. Children share the workspace's approval rules

A child's tool call reaches the same gate and reads the same per-workspace table
the parent does (`approvals.ts:50`), so a rule already granted covers it and no
card appears twice for one decision.

A separate table per child was rejected: four children each earning their own
permissions would raise four cards for a thing already allowed, and a gate that
floods is a gate people click through. Read-only children were rejected because
decision 1 chose in-process sessions precisely so a child could hold real tools
safely.

The card must name who is asking — sigil, name and role — because "write
auth.ts?" is unanswerable while four children run.

Accepted cost, stated plainly: a rule granted while watching the parent silently
covers children the reader is not watching. Allowing one write can widen into
four unattended ones. This is a real widening of blast radius and the decision
takes it knowingly, in exchange for a gate that stays legible.

### 9. Two levels deep, with one global cap

A child may spawn, a grandchild may not. The concurrency limit counts every live
session in the tree rather than each parent's own children, so depth cannot
multiply it. Defaults: four running at once, eight per call, both settings-shaped.

`nestRow` (`thread-rows.ts:43`) today matches the top level and then adopts a
grandchild as a sibling, so it needs to find the parent at any depth — about ten
lines. The reducer was never the constraint. The cost of going deeper sits in six
other places: the indent eats a narrow column until the live cell has no room, the
cap multiplies unless it is global, shared approval rules reach further from
anything the reader watched, the peek needs breadcrumbs to descend twice, replay
stores a tree rather than a list, and per-spawn names lose their lineage.

Two buys what one loses — a planner that spawns its own workers, so the
orchestrator does not hold the whole plan in its own context — while the indent
stays readable, the peek descends once, and replay stores a list of lists. Three
buys a tier with no named use and pays in all six. The line is arbitrary and
someone will hit it; it is a setting for that reason.

### 10. One child can be stopped without stopping its siblings

`x` on a focused child in the peek cancels that child; the others continue, and
its envelope entry comes back with status `cancelled`. Cancelling the turn still
stops all of them, through the `AbortSignal` decision 1 threads into each child
session.

Read-only was rejected because the peek is opened precisely when one child is
wedged and its siblings are fine; without this the only remedy is killing the
good work too. Telling the parent mid-flight was rejected as a different feature
— resolving or streaming the call early is steering, not cancelling.

A cancelled entry carries no `output` at all rather than a partial one: a
half-finished report read as a finished one is the failure mode, and the role
preamble says so. `x` is destructive inside an otherwise read-only surface, so it
confirms first.

### 11. A thread's usage figures include its children

The status bar shows one number and it is the true one; the per-child breakdown
lives in the peek, where decision 7 already puts it.

Excluding them is how Codex earned its public complaint — an `ultra` parent
spawning `ultra` children multiplied the bill invisibly. It is also actively
misleading here: subagents exist to move work out of the parent's context, so the
parent's own count *falls* when they are used well, and an uncounted fan-out would
read as having made the thread cheaper. A separate figure beside the total was
rejected as splitting attention on a number people only glance at.

Accepted cost: a large total does not say it is large because the thread fanned
out, and answering that needs the peek.

### 12. Four roles ship, all editable, and a role is optional

Scout, planner, developer and reviewer are seeded on first run — pi's own sample
division, where scout reads on a cheap model, planner and reviewer read without
writing, and developer holds the full set. Seeding happens once and never again,
so every later edit is the user's and nothing we ship overwrites it.

An empty registry was rejected because the model would see the tool, call it, and
be told nothing is configured — and a tool that fails once is a tool the model
stops reaching for. Working examples also teach the shape of a role faster than an
empty form does.

**A role is only an added system prompt**, so the orchestrator may supply one
inline instead of naming a saved role when no saved role fits. This does not
reopen the injection question decision 2 closed: the worry was a system prompt
arriving from a file in a cloned repository, not one the model composes in a
thread the reader is watching.

Accepted cost: shipped defaults carry model ids, and a default pointing at a
retired model fails at spawn time rather than in the settings screen.

### 13. The orchestrator may narrow a child's tools, never widen them

A role's tool set is a ceiling. The spawn call may remove from it — "developer
without bash" is reasonable and always safe — and may not add.

Widening would make the configured set decorative: a `scout` handed `bash`
because the task looked like it needed one is still labelled `scout` in the row,
and scout is the name the reader trusts to be read-only. It is also the escalation
path that matters, because decision 8 shares the workspace's approval rules with
children — a model that can widen its own children's tools can route around a
narrow role into a rule the reader already granted, and the gate would say yes
because it was told yes.

An inline role (decision 12) has no saved ceiling, so it takes the read-only set
and cannot be widened. An ad-hoc prompt the model wrote is the least-vetted thing
in the system and gets the least. Writing needs a saved role.

Accepted cost: inline roles are second-class, and a user who never writes a role
gets subagents that can only read.

## Acceptance criteria

Observable behavior, in the order a reader meets it.

1. The agent has a tool that spawns children. Naming a saved role runs that
   role's prompt, tools and model. Naming no role but giving instructions runs
   those instructions with the read-only tool set.
2. Naming a role that does not exist returns an error listing the roles that do,
   and does not spawn anything.
3. Several children in one call run concurrently, up to the running cap; the rest
   queue and start as slots free.
4. Each child appears as a row nested under the spawn call: sigil, name, role,
   label, and a live cell showing the child's current tool call.
5. No two children live at the same moment carry the same name.
6. A child's own tool calls are visible in its peek while it runs. `l` on a
   focused child row opens the peek; `h` closes it. Neither moves thread focus
   while a child row is focused.
7. The live cell shows elapsed time, updating once a second, from one app-wide
   clock that does not exist when no child is running and does not tick while the
   window is hidden.
8. A child's tool call that needs approval raises a card in the parent thread
   naming the child, and a rule already granted for that workspace covers it
   without a card.
9. `x` on a focused child in the peek confirms, then cancels that child only. Its
   siblings continue. Its envelope entry has status `cancelled` and no output.
10. Cancelling the parent turn cancels every live child in the tree.
11. The parent model receives one entry per child: name, role, label, status,
    output capped, `truncated`, usage.
12. A child may spawn children. A grandchild may not, and is told so.
13. The running cap counts every live session in the tree, not per parent.
14. The thread's usage figures include every child's usage.
15. Reopening the thread redraws every child row with its name, role, label,
    status, duration and usage. The peek then shows the child's summary.
16. On first run four roles exist. Editing one persists. Nothing later overwrites
    an edit.

## Validation evidence

- Unit: the tool's parameter validation, including the unknown-role error, the
  narrow-only tool rule, and the inline-role read-only ceiling.
- Unit: name drawing under concurrency — no duplicate among live children, names
  released on settle.
- Unit: the envelope shape for each terminal status, including a cancelled entry
  carrying no output and a truncated entry carrying the flag.
- Unit: `nestRow` placing a row at depth 2, and the cap counting a whole tree.
- Unit: the reducer rebuilding child rows from a recorded result, the way
  `ask-replay` is covered.
- Unit: the clock starting on the first child, stopping on the last, and pausing
  when the document is hidden.
- Live, gated by `PIOCARINA_PI_LIVE=1`: a real model spawning two children that
  both complete, and the parent's reply showing it read both entries.
- Browser harness: the peek opened and closed by key and by mouse, and a child
  cancelled from it.

## Risks & open questions

- **The settings surface for roles and the name pool is not designed.** It is the
  first real form in the app and has to be keyboard-first. Ticket-level work, not
  a spec-level unknown.
- **The peek's focus rank** against the ask card, block menu and leap hints is
  unassigned. That ordering has caused two review findings already.
- **Name pool exhaustion** has no behavior. Thirty names against a cap of four
  cannot exhaust today; it will read as a bug the day the cap is raised.
- **A crashing child takes the app down** (decision 1's accepted cost). No
  mitigation is specified.
- **Shared approval rules widen blast radius** (decision 8's accepted cost). The
  card naming the child is the only mitigation.
