# Specifications

Canonical product and behavior specifications live here.

Name specs `YYYY-MM-DD-short-slug.md`. Keep them proportional to risk and ambiguity. Tracker items may link here but do not replace these files.

## Active

- [piocarina-architecture.md](piocarina-architecture.md) — settled architecture
  decisions, defaults, and open risks (source grill, 2026-08-15). Parent of all
  specs below.
- [2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md) — layout,
  keyboard model, strip, overlays, statusbar. **Milestone 1 contract (frozen).**
- [2026-08-16-change-review.md](2026-08-16-change-review.md) — the diff of every
  edit, in the ledger and in a floating viewer. **Grilled and approved.**
- [2026-08-16-modes-amendment.md](2026-08-16-modes-amendment.md) — shell
  amendment: the real mode set, DIFF, `d`, and the ledger's dynamic gutter.
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
- [2026-08-15-ask-tool.md](2026-08-15-ask-tool.md) — `ask_user`: the agent stops
  and asks a real question, several at a time, answered from the keyboard.
  **Approved 2026-08-17.** Tickets in
  [2026-08-17-ask-tool.md](../exec-plans/active/2026-08-17-ask-tool.md).
- [2026-08-16-thread-isolation.md](2026-08-16-thread-isolation.md) — an optional
  worktree per thread, and the path from a finished thread to a pull request.
  **Approved 2026-08-17.** Tickets in
  [2026-08-17-thread-isolation.md](../exec-plans/active/2026-08-17-thread-isolation.md).
- [2026-08-15-subagents.md](2026-08-15-subagents.md) — a child agent per role,
  nested under the call that started it, watched from a peek and counted in the
  thread's own figures. **Approved 2026-08-17.** Tickets in
  [2026-08-17-subagents.md](../exec-plans/active/2026-08-17-subagents.md).
- [2026-08-16-leap.md](2026-08-16-leap.md) — reach a block by typing the words
  you can see. **Approved 2026-08-16; implemented as H5** in
  [2026-08-16-chat-navigation.md](../exec-plans/active/2026-08-16-chat-navigation.md).
  Supersedes the block-labelling leap in H3.
- [2026-08-17-lsp-integration.md](2026-08-17-lsp-integration.md) — opt-in
  language servers per workspace; the agent asks the LSP first and greps as a
  fallback. **Approved 2026-08-18.** Tickets in
  [2026-08-18-lsp.md](../exec-plans/active/2026-08-18-lsp.md).
- [2026-08-17-web-fetch.md](2026-08-17-web-fetch.md) — a `fetch` tool that hands
  the agent a page as clean Markdown instead of raw HTML. **Approved
  2026-08-18.** Tickets in
  [2026-08-18-web-fetch.md](../exec-plans/active/2026-08-18-web-fetch.md).
- [2026-08-17-paste-and-media.md](2026-08-17-paste-and-media.md) — clipboard
  screenshots, large pastes folded to a chip, mentions as chips, and images
  drawn wherever they appear. **Approved 2026-08-18.** Tickets in
  [2026-08-18-paste-and-media.md](../exec-plans/active/2026-08-18-paste-and-media.md).
- [2026-08-18-permissions-and-defaults.md](2026-08-18-permissions-and-defaults.md)
  — three permission levels with `auto` the default, global defaults for a new
  workspace and a new thread, and a workspace screen with its own key.
  **Approved 2026-08-18.**

## Need grilling

Groundwork with open questions, **not approved contracts** — run `$sonata-grill`
on one before implementing it. Each carries its own list of what the grill must
settle. Ordered by the ranking in
[the landscape read](../reference/2026-08-16-agent-harness-landscape.html).

- [2026-08-16-project-surface.md](2026-08-16-project-surface.md) — the commands a
  project defines, and the instruction file the session loaded.
- [2026-08-16-thread-fork.md](2026-08-16-thread-fork.md) — fork at a checkpoint
  instead of restoring over the top of the work.
- [2026-08-16-keymap-and-hooks.md](2026-08-16-keymap-and-hooks.md) — rebindable
  keys, lifecycle hooks, and authored approval policy. One configuration seam.
- [2026-08-18-tool-row-grouping.md](2026-08-18-tool-row-grouping.md) — runs of
  similar tool calls collapse to one expandable summary row, and the
  language-server rows get a denser vocabulary led by `lsp`.
- [2026-08-18-chat-polish.md](2026-08-18-chat-polish.md) — the transcript
  follows the stream with a jump-back affordance, sent chips flow inline with
  the text, and a read screenshot draws its thumbnail.
- [2026-08-18-reasoning.md](2026-08-18-reasoning.md) — pi's thinking rendered
  muted and collapsible instead of thrown away, with a global toggle.
- [2026-08-18-icons.md](2026-08-18-icons.md) — replace unicode glyph
  iconography with one real SVG icon set; candidates surveyed, choice open.

## Deferred

Owner decision, 2026-08-16. Not gaps to close; capabilities out of this
workflow. Reopen with a grill if the reason changes.

- **MCP surface** — list servers and their tools, render MCP calls in the
  ledger. Reopen if pi ships tools that only arrive over MCP.
- **Plan mode** — the agent proposes, the reader approves, then it edits. Cheap
  to add later: the approve card and the block menu already exist.

Visual reference for all of the above: [docs/reference/design/](../reference/design/).
