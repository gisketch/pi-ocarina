# The project's own commands and instructions

Status: **GRILL IN PROGRESS.** Not an approved contract.

## What the grill found in the code

pi's `ResourceLoader` — the object this app already constructs in
[session-extensions.ts](../../src/main/session/session-extensions.ts) — holds
everything this spec set out to discover:

| method | what it answers |
| --- | --- |
| `getPrompts()` | the project's commands. pi calls them prompt templates. |
| `getSkills()` | every loaded skill: name, description, filePath, sourceInfo |
| `getAgentsFiles()` | the instruction files, path and content |
| `getSystemPromptSource()` | which file became the system prompt |
| `reload()` | what happens when a file changes on disk |

Each getter also returns `diagnostics`, which is this spec's "a malformed
command file names itself in an error, and the rest still work" — already built.

So the work is not discovery and loading. It is exposing what main already holds.

**Skills reach the agent two ways, and only one is a tool call.**

- The model reads `SKILL.md` itself. pi has no skill tool: `formatSkillsForPrompt`
  puts names and descriptions in the system prompt, and only when the `read`
  tool exists. pi's own TUI classifies such a read by one rule — basename
  `SKILL.md`, label the parent directory's name.
- The reader types `/skill:name`. `_expandSkillCommand` inlines the skill body
  into the user message. The model never takes this path.

A skill's frontmatter may carry `disable-model-invocation`, which hides it from
the system prompt and leaves only the explicit path.

## Problem

The slash menu offers three commands: `commit`, `compact`, `model`. The app
hard-codes all three. A project cannot add its own, and pi's own commands never
reach the menu.

The instruction file has the same shape of problem. pi reads a project's
instruction file at the start of a session. PiOcarina never shows which file that
was, or what it said. A reader who wonders why the agent behaves a certain way
has to leave the app to find out.

## Desired outcome

The reader sees what the project told the agent, and can run what the project
defines, from the same menu as the built-in commands.

## In scope

- Surfacing the commands the loader already holds, in the slash menu, typed by
  source.
- A read-only inventory of what this workspace loaded: commands, skills,
  instruction files, and the file that became the system prompt.
- A `skill` row in the ledger when the agent reads a skill.
- A shipped skill creator, writing to the project or to the global directory.
- Reloading on demand: at thread start, from the inventory, and from `/reload`.

## Out of scope

- Authoring commands inside PiOcarina. A file on disk stays the source.
- Running a project command outside a thread. A terminal column has no session.
- Any instruction file format PiOcarina invents. The project uses what pi uses.
- Watching the filesystem.
- Editing a skill in the app. The creator writes one; an editor opens it.

## Acceptance behavior

- A project with its own commands shows them in the slash menu.
- Each entry states its type: built in, project, or pi.
- A project command and a built-in with the same name both appear, each typed.
- A project with no commands shows the built-in commands, as today.
- The reader reads the loaded instruction file without leaving the app.
- The inventory lists every loaded skill with its name, description and path.
- A malformed command or skill file names itself in an error, and the rest of
  them still load.
- The agent reads a skill, and the ledger says `skill` and names it — not
  `read`, and never inside a collapsed run of reads.
- The reader asks the agent for a new skill and gets a file in the project.
- The same request aimed at the global directory raises an approve card.
- An edited skill takes effect after a reload and not before.
- A reload requested during a running turn is refused, and says why.

## Settled decisions

### The inventory is a read-only section in Workspace Settings — 2026-08-18

Not its own screen and not its own key. The inventory is workspace-scoped, which
is what that screen already is, and a list consulted occasionally does not earn
one of the few remaining leader letters.

Accepted cost: Workspace Settings today holds things the reader chooses — LSP
servers, permission level. The inventory is what the project imposed. One screen
now mixes both, so it must be visibly clear which rows can be changed.

### A skill read is its own kind of row — 2026-08-18

A new `ToolKind`, `skill`, with its own icon and its own word. Not a `read` with
a detail line.

The grouping seam decides it. `GROUPABLE` collapses runs of `read` into one
summary row, and a skill load inside such a run would vanish — yet a skill
changes how the agent behaves for the rest of the turn. That is the one read
that must not be swallowed.

Accepted cost: a skill load stops counting toward the read total, so a reader
auditing what the agent touched sees four reads where it opened five files.

### The app ships a skill creator, and it may write to either place — 2026-08-18

The creator itself is loaded through `additionalSkillPaths`, pointed at a
directory inside the app's own resources. The app never writes into
`getAgentDir()`: that is pi's configuration, and a file dropped there would be a
skill the reader did not write, from a source they cannot trace.

Accepted cost: the creator exists only inside PiOcarina. Running `pi` in a
terminal on the same repository does not have it.

The skill it writes may go to the project (`.pi/skills/<name>/SKILL.md`) or to
the global skills directory. Owner decision; the recommendation had been
project-only.

No new mechanism is needed to keep the global write honest. `auto` already means
"asks only about what leaves the workspace", so a global write raises an approve
card naming the path, and a project write does not.

### Reload is explicit, and never mid-turn — 2026-08-18

`reload()` runs at thread start, from a refresh action in the inventory, and
from a `/reload` slash command. No file watcher.

A watcher would cost handles across every open workspace and fire on every
editor save, including half-written ones. The deciding reason is worse than
cost: a reload changes the system prompt underneath a thread that is already
running. pi builds the prompt per request, so turn three would run under
different instructions than turn two, with nothing in the transcript saying so.

A refresh requested mid-turn is refused, not queued. A queued reload lands at a
moment nobody chose.

Accepted cost: an edited skill does not take effect until the reader reloads.
The button and the command say so plainly.

### A project command never shadows a built-in — 2026-08-18

Both appear in the slash menu as separate entries, each labelled with its type.
Neither wins, because neither is guessed at: the menu is a list the reader picks
from, not a shell that resolves a name.

Built-in entries sort first, so a filter narrowed to one word leaves the app's
own action under the cursor.

Rejected: letting a project command take a built-in's name. `/commit` opens the
commit card, so a project that could capture it would change what a button in
the app does, for a reader with no reason to suspect it.

Accepted cost: two entries reading as "commit", separated by a type label.

## Constraints

- Discovery happens in the main process. The renderer receives a list.
- Reading files a project owns is a read. It never writes to them.
- The slash menu is a spotlight. Its filtering and keys stay as they are.
- Command names come from disk, which is untrusted text. A name is data, never
  markup, and never a shell fragment.

## Validation

- Tests over a fixture project: commands and skills present, absent, malformed.
- A classification test for the `skill` row: `SKILL.md` in any directory, a file
  merely named like one, and a read that is not a skill at all.
- A grouping test proving a skill row is never absorbed into a run of reads.
- A test that a mid-turn reload is refused.
- A live pass: a project command runs, a skill loads, and both appear correctly
  in the ledger.

## Questions the code answered, not the grill

1. **Does pi expose its commands over the SDK?** Yes. `getPrompts()`,
   `getSkills()`, `getAgentsFiles()`, `getSystemPromptSource()`, each with
   diagnostics.
2. **Does a project command produce a prompt or run a shell command?** A prompt.
   pi's prompt templates expand into message text.
3. **What does a project command mean for a terminal column?** Nothing. A
   terminal has no session, so the menu does not offer them there.
4. **Where does the instruction file appear?** The inventory section, decided
   above.
5. **Watch or read at start?** Read, plus explicit reload. Decided above.
6. **Argument syntax?** pi's, through `expandPromptTemplate`. The app invents
   none.

## Risks

- The inventory reads files the project owns. A name or description from disk is
  untrusted text and must render as data, never as markup.
- The skill creator writes files an agent authored. A skill is instructions the
  next session will follow, so a bad one is durable in a way a bad edit is not.
- Two commands named the same, distinguished by a type label, will be picked
  wrongly at least once.
