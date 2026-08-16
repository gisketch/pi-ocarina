# Specifications

Canonical product and behavior specifications live here.

Name specs `YYYY-MM-DD-short-slug.md`. Keep them proportional to risk and ambiguity. Tracker items may link here but do not replace these files.

## Active

- [piocarina-architecture.md](piocarina-architecture.md) — settled architecture
  decisions, defaults, and open risks (source grill, 2026-08-15). Parent of all
  specs below.
- [2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md) — layout,
  keyboard model, strip, overlays, statusbar. **Milestone 1 contract (frozen).**
- [2026-08-15-selectors-settings.md](2026-08-15-selectors-settings.md) — shell
  amendment: switcher fzf, settings overlay, `m`/`,` keys, spotlight primitive.
- [2026-08-15-thread-ledger.md](2026-08-15-thread-ledger.md) — messages, tool
  ledger, ask/approve, agent-flow states, virtualization.
- [2026-08-15-session-backend.md](2026-08-15-session-backend.md) — SessionDriver,
  catalog, lifecycle, failures, approvals. **Milestone 2 contract.**
- [2026-08-15-composer-controls.md](2026-08-15-composer-controls.md) — composer,
  slash, @-mention, attachments, model/reasoning, history search.
- [2026-08-16-core-usability.md](2026-08-16-core-usability.md) — welcome screen,
  real new/close thread, live status bar, model-chip race. **Ships before git
  & terminal.**
- [2026-08-16-turn-structure.md](2026-08-16-turn-structure.md) — how a
  tool-calling turn projects into blocks. Amends the thread & ledger spec.
- [2026-08-15-git-terminal.md](2026-08-15-git-terminal.md) — git status pipeline,
  commit card, pty drawer, toasts/modals/banner.
- [2026-08-16-leap.md](2026-08-16-leap.md) — reach a block by typing the words
  you can see. Grilled; awaiting approval. Supersedes the block-labelling leap
  in H3.

## Need grilling

These describe things pi does not provide and we intend to build. They are
groundwork with open questions, **not approved contracts** — run
`$sonata-grill` before implementing either.

- [2026-08-15-ask-tool.md](2026-08-15-ask-tool.md) — a custom tool that lets the
  agent ask the user a question. pi 0.84 has no elicitation of its own.
- [2026-08-15-subagents.md](2026-08-15-subagents.md) — a custom tool that runs a
  child agent and nests its calls. pi 0.84 has no agent tool, and its tool
  events carry no parent.

Visual reference for all of the above: [docs/reference/design/](../reference/design/).
