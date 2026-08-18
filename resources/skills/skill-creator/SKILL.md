---
name: skill-creator
description: Write a new skill — a reusable set of instructions this agent will follow later. Use when the reader asks to create, add, or save a skill, or describes a routine they want repeated.
---

# Writing a skill

A skill is a folder holding a `SKILL.md`. Its frontmatter says what the skill is
for; its body says how to do the thing. The agent reads the body when it decides
the description matches the task in front of it.

Write one only when asked. A skill is durable: it changes how every later
session behaves, which is not a side effect to have while doing something else.

## Where it goes

Ask the reader which, unless they already said:

- **The project** — `.pi/skills/<name>/SKILL.md`, under the workspace folder.
  It travels with the repository. Anyone who clones it gets the skill, and it is
  reviewed like any other file. Choose this when the skill is about *this*
  codebase: its conventions, its commands, its deployment.

- **This machine** — the global skills directory, outside the workspace.
  It follows the reader into every project and follows nobody else. Choose this
  when the skill is about how *they* work rather than about one repository.

Either destination raises an approval card naming the path — the global one
because it leaves the workspace, the project one because `.pi` holds a project's
agent configuration. That is expected. Say so rather than treating the card as a
failure.

## The frontmatter

```
---
name: <lowercase-with-hyphens, matching the folder name>
description: <one sentence: what it does, and when to reach for it>
---
```

The description is the only part the agent sees before it decides to read the
rest. Write it as a trigger, not as a title: name the task and the words a
reader would use for it. `Format and lint the workspace before a commit` beats
`Formatting helper`.

Add `disable-model-invocation: true` when the skill should run only on an
explicit `/skill:<name>`. Use it for anything expensive or destructive.

## The body

Write instructions, not description. Short sections. Real commands. Say what to
do when a step fails, because that is the part the agent cannot guess.

Keep it to what a reader could not work out from the repository itself. A skill
that restates the README earns nothing and costs context on every session that
loads it.

## After writing

Tell the reader the path, and that the skill reaches the agent after `/reload`
or on the next thread — not immediately.
