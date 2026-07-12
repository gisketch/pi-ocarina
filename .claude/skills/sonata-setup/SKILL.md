---
name: sonata-setup
description: Configure or repair a new or already-understood Sonata project harness. Use for greenfield project setup, issue-tracker selection, project-brief completion, architecture mapping, or verification-command discovery; use sonata-retrofit for deep adoption of an established codebase.
---

# Sonata Setup

Interview the project until it has enough explicit context to begin its current milestone.

1. Read the manifest and repository map. Inspect source, package/build files, tests, remotes, Git state, and existing docs before asking anything.
2. Ask exactly one unresolved decision per turn. Never ask for facts the repository already answers. Give one recommendation and its main tradeoff.
3. Resolve and record in `docs/project-brief.md`:
   - Product Vision: the long-term destination.
   - Users and operating environment.
   - Current Milestone: the next useful outcome.
   - Non-Goals: what the product fundamentally will not do.
   - Later / Not Now: valid ideas deferred beyond this milestone.
   - Observable acceptance behavior and durable constraints.
4. Detect an existing stack. For greenfield work, ask whether the user has one in mind; otherwise recommend one primary stack and one alternative. Record the choice without installing or scaffolding it.
5. Detect Git with `git rev-parse --show-toplevel`. If no repository exists, recommend `git init`; run it only after confirmation and never create a commit automatically. Declining Git does not block readiness.
6. Resolve issue tracking: Local only (recommended), GitHub Issues, Linear, or Other with custom input. Write `docs/issue-tracker.md`; keep credentials out and do not create external resources without explicit approval.
7. Discover bootstrap, run, primary-behavior, failure-observation, reset, and other project checks. Verify commands when an application exists; mark them Planned for greenfield work. Do not ask for a quality posture—validation is chosen dynamically from each task's scope and risk.
8. Update architecture with known facts only. Preserve useful existing docs and keep `AGENTS.md` a map.
9. Present a final readiness summary. Resolve every missing checklist item before finishing.
10. Run `./scripts/check-sonata.sh` and the narrowest available project check. Then set manifest `setup` to `{ "status": "ready", "version": 1, "completedAt": "<ISO timestamp>" }`.
11. After readiness, detect whether a runnable project shell exists. If absent and a stack is selected, offer a direct handoff to `$sonata-implement` to create the smallest runnable shell. If one exists, offer `$sonata-work` to begin the Current Milestone. Do not scaffold inside setup.

Pending projects remain pending if interrupted. When rerunning setup on a ready project, keep the old ready state until the revised interview completes successfully.
