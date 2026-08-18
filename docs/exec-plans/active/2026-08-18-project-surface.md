# The project's own surface — tickets

Spec: [2026-08-16-project-surface.md](../../specs/2026-08-16-project-surface.md)

Status legend: `todo` · `in-progress` · `done`.

Five vertical slices. pi's `ResourceLoader` already holds the data, so most of
the work is a command, a screen, and a row.

---

## P1 — the reader sees what the project loaded — `todo`

**Delivers.** Workspace Settings gains a read-only section naming every command,
skill and instruction file this workspace loaded, and the file that became the
system prompt. A malformed one is listed as broken with its reason.

- `src/shared/project-surface.ts`, pure: `ProjectSurface` with `commands`,
  `skills`, `instructionFiles`, `systemPromptSource`, `problems`.
- Main reads it off the loader the session already built: `getPrompts()`,
  `getSkills()`, `getAgentsFiles()`, `getSystemPromptSource()`, and each
  getter's `diagnostics`.
- Command `projectSurface: { params: { threadId }; result: { surface } }`.
- A section in `WorkspaceOverlay.svelte`, visibly separated from the rows the
  reader can change, since the screen now mixes chosen settings with imposed
  facts.
- An instruction file's content opens in a scrolling pane. Names, descriptions
  and content render as text — they come from disk and are untrusted.

**Acceptance.** Spec acceptance: instruction file readable in-app; the inventory
lists every skill with name, description and path; a malformed file names itself
and the rest still load.

**Validation.** A fixture workspace with a good command, a good skill, a
malformed skill and an `AGENTS.md`. A test that a name containing markup renders
as text.

**Blocked by.** Nothing.

---

## P2 — project commands in the slash menu — `todo`

**Delivers.** A project's commands appear in the slash menu, each labelled with
its type. A project command named like a built-in appears next to it rather than
replacing it.

- `SlashCommand` gains `source: 'built-in' | 'project' | 'pi'`.
- The list is built from the surface P1 already returns, with built-ins first so
  a filter narrowed to one word leaves the app's own action under the cursor.
- Picking a project command sends its expanded text as a prompt. Expansion is
  pi's, through `expandPromptTemplate`; the app invents no argument syntax.
- The menu is not offered in a terminal column, which has no session.

**Acceptance.** Spec acceptance 1, 2, 3, 4.

**Validation.** Ordering tests, including a collision. A test that a project
command reaches the driver as prompt text. A test that a terminal column offers
nothing.

**Blocked by.** P1.

---

## P3 — a skill load reads as a skill — `todo`

**Delivers.** The agent reads a skill and the ledger says `skill` and names it,
with its own icon. It is never swallowed into a collapsed run of reads.

- `skill` joins `ToolKind`. It is **not** added to `GROUPABLE`, and a comment
  says why: a skill changes how the agent behaves for the rest of the turn, so
  it is the one read that must stay visible.
- Classification in `tool-rows.ts`, matching pi's own rule: basename `SKILL.md`,
  label the parent directory's name.
- An icon in the `ICONS` registry, and a row that renders `{icon} skill · name`.

**Acceptance.** Spec acceptance: the ledger says `skill` and names it, never
`read`, never inside a collapsed run.

**Validation.** Classification tests: `SKILL.md` at several depths, a file named
`skill.md`, a file named `MY-SKILL.md`, and an ordinary read. A grouping test
proving a skill row breaks a run of reads rather than joining it.

**Blocked by.** Nothing. Independent of P1.

---

## P4 — reload on demand, never mid-turn — `todo`

**Delivers.** The reader edits a skill, types `/reload`, and the next turn uses
it. Asking during a running turn is refused with a reason.

- `reloadProject: { params: { threadId }; result: { surface } }`, calling the
  loader's `reload()` and returning the fresh surface.
- A `/reload` built-in, next to `commit`, `compact` and `model`.
- A refresh action in the P1 section, using the same command.
- Refused while the thread is running, with a toast saying so. Never queued: a
  queued reload lands at a moment nobody chose.
- The label states that an edit does not take effect until this runs.

**Acceptance.** Spec acceptance: an edited skill takes effect after a reload and
not before; a mid-turn reload is refused and says why.

**Validation.** A test that a running thread refuses. A test that the returned
surface reflects a file written between the two calls.

**Blocked by.** P1.

---

## P5 — the app ships a skill that writes skills — `todo`

**Delivers.** The reader asks for a new skill and gets a written `SKILL.md`,
in the project or in the global directory. The global write raises an approve
card naming the path; the project write does not.

- `resources/skills/skill-creator/SKILL.md`, shipped with the app and loaded
  through `additionalSkillPaths`. The app never writes into `getAgentDir()`.
- The skill's instructions cover both destinations and state the difference:
  a project skill travels with the repository, a global one does not.
- No new permission machinery. `auto` already means "asks only about what leaves
  the workspace", so the card falls out of the level.

**Acceptance.** Spec acceptance: the reader gets a file in the project; the same
request aimed at the global directory raises a card.

**Validation.** A test that the shipped path is loaded and the skill appears in
the surface. A permission test that a write under the agent directory raises a
card at `auto` and a write inside the workspace does not.

**Blocked by.** P1, for the surface that proves it loaded.

---

## Order

`P1 → P2`, `P1 → P4`, `P1 → P5`. `P3` is independent and can go first.
