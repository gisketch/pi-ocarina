# Permission levels, and settings that have a default

Status: **approved** — 2026-08-18. Grilled internally; decisions recorded below.

## Problem

The app asks before every `bash`, `write` and `edit`. There is one policy and no
way to change it, so a reader doing ordinary work in their own repository answers
the same question dozens of times a turn. The cost is not the keystroke — it is
that a prompt which arrives for everything carries no signal, so the one prompt
that mattered gets the same reflex `y` as the forty that did not.

Two smaller problems travel with it:

- Nothing has a default. A new workspace, and a new thread inside it, start
  wherever the code happens to start them. The reader sets the same model and the
  same reasoning level again on every thread.
- Workspace settings exist but are reached through global settings, which is the
  wrong shape: a per-workspace screen nested inside the app-wide one reads as if
  the workspace were a subsection of the app.

## Desired outcome

Three permission levels, `auto` the default. Global defaults for what a new
workspace and a new thread start as. A workspace screen with its own key.

## What the field does

Read before the decisions, because both tools converged on the same split and
this spec keeps it.

**Claude Code** separates the *mode* (when it asks) from *rules* (allow, ask,
deny — which always win, in every mode). Its modes are `default` (labelled
Manual — ask on first use of each tool), `acceptEdits`, `plan`, `auto`,
`dontAsk`, and `bypassPermissions`. Two ideas are worth taking. **Protected
paths**: writes to `.git` and to its own configuration are never auto-approved
except under `bypassPermissions`, whatever the mode and whatever the allow rules
say. **A read-only command set**: `ls`, `cat`, `grep`, `wc`, `stat`, read-only
`git`, and so on run without a prompt in every mode, with named exceptions where
a flag makes one of them write. Its `auto` mode routes the remaining actions to a
second model, a classifier.

**Codex** separates `sandbox_mode` (`read-only`, `workspace-write`,
`danger-full-access`) from `approval_policy` (`untrusted`, `on-failure`,
`on-request`, `never`), and ships three presets over the pair: Read Only, Auto,
Full Access. Its Auto lets edits and commands run inside the workspace and
escalates to a prompt for anything that reaches outside it or needs the network.
The containment is real: an OS sandbox, not a rule.

## Decisions

### 1. Three levels, named for what they do

| level | asks about | for |
| --- | --- | --- |
| `full` | nothing | a container, a scratch clone, a repo you would throw away |
| `auto` **(default)** | what leaves the workspace, and what cannot be undone | ordinary work in your own repository |
| `ask` | the first use of every tool that changes something | unfamiliar code, someone else's repository |

`ask` is exactly today's behaviour, unchanged, including its remembered "always
allow" rules. Nothing a reader has already approved is lost.

A read-only level is **not** in this spec. It is a real fourth level and it is
cheap once the seam exists, but three is what was asked for, and adding a fourth
without a reader asking for it makes the picker longer for everyone. Recorded
under Later.

### 2. Auto is a stated rule, not a classifier

Claude Code's `auto` asks a second model whether each action matches the intent.
This app will not, for two reasons. It costs a round-trip and tokens before every
shell command, on a local keyboard-first tool where the whole point is that the
turn does not stall. And a policy a reader cannot predict makes an arriving
prompt feel random — which is the failure this spec exists to fix, reintroduced
one level up.

So `auto` is a rule, written down, testable, and short enough to hold in a head.

**Runs without asking:**

- Every read-only tool: `read`, `grep`, `find`, `ls`, the six `lsp_*` tools, and
  `fetch` with `GET` or `HEAD`.
- `write` and `edit` to a path inside the workspace that is not protected.
- `bash` whose command passes the bash rule below.

**Asks:**

- `write` or `edit` to any path outside the workspace root.
- Any write to a **protected path**, inside the workspace or not: `.git/`
  (the directory, not the working tree), `.env` and `.env.*`, `~/.ssh`, `~/.pi`,
  and this app's own catalog.
- `fetch` with a write method. Unchanged from today.
- `bash` that fails the bash rule.

**The bash rule.** A command runs when *every* one of these holds:

1. It contains no command substitution — no `$(…)`, no backticks, no `<(…)`.
   What a substitution expands to is not knowable before it runs, so it is not
   approvable before it runs.
2. Every segment, split on `&&`, `||`, `;` and `|`, passes on its own. A
   compound command is as dangerous as its worst part.
3. No segment's first word is on the **stop list**: `sudo`, `rm` with `-r` or
   `-f`, `chmod`, `chown`, `curl`/`wget` piped into a shell, `git push`,
   `git reset --hard`, `git clean`, `npm publish`, `cargo publish`,
   `dotnet nuget push`, `docker` with a daemon-selecting flag.
4. No redirect target and no path argument resolves outside the workspace root.

Anything this rule cannot parse is asked about. Fail closed, always.

**What `auto` is honest about.** `pnpm test` passes the rule and can do anything
the repository's own scripts do. This app has no sandbox — pi spawns a real child
process on a real filesystem — so `auto` is a policy about *asking*, never a
guarantee about *reach*. A reader who does not trust the repository should use
`ask`. This sentence belongs in the picker, not only in this file.

### 3. Full Access is loud

It never asks, including for protected paths. Two things keep it from being a
silent foot-gun:

- Switching to it goes through the existing confirm gate, and the confirmation
  names what changes.
- The status bar shows it for as long as it is on, in the accent colour. A level
  that is invisible is a level that surprises.

### 4. Precedence: thread, then workspace, then global

A thread override beats its workspace, which beats the global default. Absent at
a level means inherit, never means `ask`.

The thread override lives for the session only and is **not stored**. A relaunch
returns the thread to its workspace's level. Storing it would mean a window
reopening days later at Full Access because of a decision the reader made once
for one command and does not remember making.

Workspace and global levels are stored, in the catalog, beside the LSP settings
that already live there.

### 5. Enforcement stays in main

`ApprovalGate.request` is already the single seam every gated call passes
through, and it already lives in main. The level is resolved there. The renderer
displays the level and offers the picker; it never decides. A view can be raced
or reloaded, and this is not a policy to keep in one.

Existing "always allow" rules keep working at `ask` and at `auto`: a remembered
yes for `git push` stops `auto` asking about it too. At `full` nothing is asked,
so nothing is remembered.

### 6. Global Settings holds the defaults

Three new rows, alongside grain, motion and the leader timeout:

- **default permission** — what a workspace with no setting of its own uses.
- **default model** — what a new thread starts on. "pi's choice" is a value.
- **default reasoning** — what a new thread starts at. "model default" is a value.

### 7. Workspace Settings gets its own key

`<` in NORMAL, and `S` on the leader — the shifted siblings of `,` and `s`, which
open global settings. The shift reads as "this workspace" on both surfaces.

It shows, for the open workspace: its permission level (with "inherit — auto"
shown when it has none of its own), and its language servers, which are already
there. It no longer has to be reached through global settings; the settings
screen keeps a one-line hint naming the key, so the reader can still find it.

### 8. Model and reasoning are already per thread — finish it

pi stores both in the session file, so two threads already can differ. What is
missing is the top and the bottom of it:

- A new thread starts at the global default rather than wherever pi lands.
- The model picker acts on the focused thread and says which thread it is acting
  on.
- A thread's model and reasoning are visible without opening the picker.

A per-workspace model default is **not** in this spec. Global default plus a
per-thread choice covers the stated need; a third level to resolve is a third
place to look when a thread starts on the wrong model.

## Acceptance behavior

1. A fresh install runs at `auto`. Editing a file in the workspace and running
   `pnpm test` produce no prompt.
2. At `auto`, `rm -rf build` prompts. `git push` prompts. Writing to `.env`
   prompts. Writing to `/tmp/x` prompts. Reading any of them does not.
3. At `auto`, `cd src && cat app.ts` runs; `cat $(cat target.txt)` prompts.
4. At `full`, none of the above prompts, and the status bar names the level the
   whole time.
5. At `ask`, behaviour is byte-for-byte what it is today, including "always
   allow".
6. Setting a workspace to `ask` while the global default is `auto` changes that
   workspace only. Removing the workspace setting returns it to `auto`.
7. A thread set to `full` returns to its workspace's level after a relaunch.
8. `<` opens Workspace Settings from NORMAL with no overlay open, and from
   inside global settings.
9. A new thread opens on the model and reasoning named in global settings.
   Changing one thread's model leaves its neighbour's alone.
10. A catalog written by the previous version loads, and every workspace in it
    reads as `auto`.

## Validation

- Unit tests over the level resolver: every combination of thread, workspace and
  global, including all-absent.
- Unit tests over the `auto` bash rule, one per clause, plus the compound and
  substitution cases from acceptance 3 and a table of stop-list commands.
- Unit tests over protected paths, including a path that only reaches one by
  `..`, and one whose prefix matches but whose separator does not
  (`.gitignore` must not be read as `.git/`).
- A gate test per level: `full` never emits an approve event, `ask` emits what it
  emits today, `auto` emits for the asked set and not for the quiet one.
- A catalog migration test from version 7.
- Reducer tests for `<` and leader `S`.

## Risks

- **No sandbox.** Stated above, and stated in the picker. `auto` reduces
  interruptions; it does not contain anything. If this app ever gains a sandbox,
  the levels are the right place to hang it.
- **The stop list is a deny-list**, and deny-lists are always incomplete. It is
  paired with a scope check and a fail-closed parser, which is what makes it
  credible rather than decorative — but a reader who needs a guarantee needs
  `ask`.
- **`auto` as the default changes what an existing install does.** A reader who
  relies on being asked gets fewer prompts after an update they did not read.
  Mitigated by the status bar naming the level, and by the first launch after the
  migration saying which level it chose.

## Later / Not Now

- A **read-only** level, the fourth one. Cheap once the resolver exists.
- **File-authored allow and deny rules**, from
  [2026-08-16-keymap-and-hooks.md](2026-08-16-keymap-and-hooks.md). That spec
  says "the default stays ask"; this one changes the default and leaves its
  configuration seam untouched. Rules from a file layer over levels when they
  arrive: deny wins over every level, as it does in Claude Code.
- A **per-workspace default model**.
- A **classifier** for `auto`. Only worth it if the stated rule proves too blunt
  in real use, and only with the round-trip cost measured first.
