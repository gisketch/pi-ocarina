# Session Tree and Fork Navigation

## Problem and Desired Outcome

Pi Ocarina already exposes Pi session-tree, branch-navigation, branch-summary, and fork operations through the agent host, but their only entry point is hidden and the current dialog is too basic for normal use.

Make session history discoverable from the active conversation. Users should be able to understand the current branch, find an earlier point, switch branches safely, or create a separate thread from an assistant response without changing the original thread.

## In Scope

- A visible Session tree action for the active thread.
- A modal tree browser with bounded previews, current-branch context, search, expand/collapse, loading, empty, and error states.
- Keyboard and pointer navigation through visible tree rows.
- Switching the active Pi session branch with no summary or Pi's standard abandoned-branch summary.
- Restoring a selected user prompt to the composer when Pi returns editor text.
- Forking from an assistant response into a new Pi thread in the same workspace.
- Selecting the new fork, adding it to the sidebar, and leaving the source thread unchanged.
- Clear busy, disabled, cancellation, and failure behavior.

## Out of Scope

- Forking into a newly created git worktree. Existing workspace worktree management remains separate.
- Custom branch-summary instructions.
- Editing, deleting, reparenting, or merging session-tree entries.
- A graph canvas, minimap, or general-purpose tree framework.
- Fork controls on every transcript message outside the Session tree modal.
- Persisting a second tree or transcript representation outside Pi session data.

## Acceptance Criteria

### Entry and Continuity

- An active thread exposes a labeled, keyboard-reachable Session tree action in the conversation toolbar.
- The action is unavailable when no thread is selected, while the thread is running, or when the session is read-only because it was written by a newer Pi schema.
- Opening and closing the modal preserves the selected thread, composer draft, transcript scroll position, Changes layout, and sidebar state.
- Opening the modal loads the current tree from Pi and shows an inline loading state. A load failure remains inside the modal and can be retried without disturbing the conversation.

### Tree Browser

- The tree shows each entry's role or type and a concise preview without loading a parallel transcript.
- The active leaf and its ancestor path are visually distinct. The initial view expands that path and brings the active leaf into view.
- Branches can be expanded and collapsed. Search matches visible role, type, and preview text and reveals matching ancestor paths.
- An empty tree and a search with no matches have distinct, useful messages.
- Up and Down move selection, Left and Right collapse or expand branches, Enter continues with the selected entry, and Escape closes the modal when no operation is active.
- Focus stays inside the modal, visible controls have accessible names, and status is not communicated by color alone.

### Branch Navigation

- Selecting the current leaf reports that the user is already there and performs no request.
- Continuing to another entry asks whether to switch immediately or first let Pi summarize the abandoned branch.
- While navigation or summarization is active, duplicate submissions and modal dismissal are blocked; cancellation propagates to Pi when the operation supports it.
- A successful switch refreshes the conversation from the returned Pi snapshot, clears stale streamed output, and closes the modal.
- When Pi returns editor text for a selected user entry, that text becomes the composer draft after navigation.
- A failed or cancelled switch shows an actionable error and does not claim that the destination was selected.

### Forking

- Assistant response entries expose a Fork action. Non-assistant entries do not expose an unsupported fork action.
- Fork confirmation explains that the source thread remains unchanged and shows a bounded preview of the selected response.
- Confirming creates a distinct persistent Pi session containing history through the selected response, in the source workspace.
- A successful fork appears in the workspace sidebar, becomes the selected thread, starts with an empty composer, and retains the source thread for later return.
- Forking is blocked while the source is running, for read-only newer-schema sessions, and when the source session is not persistent.
- Fork failure leaves the source thread selected and reports the reason without creating a phantom sidebar row.

## Implementation Constraints and Settled Decisions

- Pi's session manager remains authoritative for tree shape, active leaf, branch navigation, summaries, and branched-session creation.
- React owns only modal presentation and temporary selection, search, expansion, and submission state.
- The existing typed agent-host operations are extended only when acceptance behavior cannot be expressed safely through their current results.
- Tree responses remain bounded to entry identity, parent relationship, type, role, preview, active state, and children. Full message content is not duplicated for this feature.
- Fork creation uses the existing session lease and schema checks and must not bypass single-writer protection.
- The first slice forks only within the current workspace. A worktree environment chooser requires a separate spec because it coordinates native git lifecycle, workspace registration, rollback, and Pi session creation.
- Use the existing dialog, button, input, icon, focus, and error patterns. Add no tree abstraction until a second consumer needs it.
- A simple flattened visible-row model is sufficient initially. Add virtualization only if measured large-session behavior requires it.

## Validation Evidence

- Agent-host contract tests prove tree identity and active-leaf mapping, navigation with and without summary, editor-text return, persistent fork creation, lease acquisition, cancellation, and rejection while running.
- Frontend tests prove initial active-path expansion, search and ancestor reveal, expand/collapse, keyboard movement, current-leaf no-op, summary choice, and fork eligibility.
- Integration tests prove successful navigation refreshes the selected thread and successful fork creates exactly one sidebar thread while preserving the source.
- Failure tests prove load, navigation, summary, and fork errors do not change selection or create phantom state.
- Accessibility checks cover dialog semantics, focus trapping and restoration, control names, keyboard operation, busy states, and non-color active indicators.
- A production build and real Tauri smoke verify opening the tree on a branched Pi session, switching branches, reopening a user prompt in the composer, forking an assistant response, and reopening both sessions after restart.

## Risks and Open Questions

- Very large or highly branched sessions can make eager rendering expensive. Measure before adding virtualization.
- Pi branch summaries can take model time and fail independently of navigation; the UI must keep that state explicit and cancellable.
- Forking depends on a persistent source session and successful lease acquisition.
- No product decision remains open for the first slice.
