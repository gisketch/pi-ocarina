# Queue Editor

## Problem and Desired Outcome

Pi Ocarina can already send `steer` and `followUp` messages into an active Pi run, and the agent host can replace or inspect that live queue. The UI hides queued items, so users cannot verify what will be delivered, correct a mistake, remove stale work, or promote a follow-up into immediate steering.

Show the active thread's ordered queue directly above the composer. Let users inspect attachments, edit or delete an item, and promote a follow-up to steer without interrupting the current run. Keep Pi's live queue authoritative and preserve the user's unrelated composer draft while editing.

## In Scope

- A compact ordered queue above the composer while the selected thread is running.
- Text, delivery mode, and attachment summaries for each queued item.
- Editing a queued item through the existing composer.
- Cancelling an edit and restoring the draft and attachments that existed before editing began.
- Deleting a queued item.
- Promoting a `followUp` item to `steer`.
- Synchronizing queue state when items are submitted, changed, consumed, the selected thread changes, or the run settles.
- Accessible actions, failure feedback, and focused component fixtures.

## Out of Scope

- Drag-and-drop or button-based queue reordering.
- Demoting a `steer` item back to `followUp`.
- Persisting queued messages after the active Pi run ends or the agent host exits.
- Scheduling messages by time, condition, dependency, or priority.
- Editing a message already consumed by Pi.
- A separate full-window queue workspace or queue history.
- Changing Pi's steering and follow-up semantics.

## Acceptance Criteria

- Submitting through Send during an active run appends one `followUp` item. Using Steer appends one `steer` item.
- The queue appears above the composer only when the selected thread has pending items or is editing one. Items render in Pi delivery order.
- Each item shows its text when present, a clear `Steer` or `Follow up` mode, and attachment names. Image attachments show a bounded preview; other files show a file treatment. Internal paths and binary data are not rendered as text.
- A `followUp` item exposes Steer, Edit, and Delete actions. A `steer` item exposes Edit and Delete; it does not offer a redundant Steer action.
- Activating Edit loads that item's text and attachments into the existing composer and marks the item as being edited. The previous composer draft and attachments are retained for restoration.
- Sending while editing replaces the same queued item in the same position, preserves its stable identity and delivery mode, clears edit state, and restores the unrelated draft and attachments captured before editing began.
- Cancelling an edit restores the exact draft and attachments present before Edit was activated and leaves the queue unchanged.
- Deleting an item removes only that item after Pi accepts the updated queue. Deleting the item currently being edited also exits edit mode and restores the previous draft.
- Promoting a follow-up changes only its mode and retains its identity, position, text, and attachments. The UI reflects the change only after Pi accepts it.
- Switching between threads shows the queue belonging to the selected active thread. Queue state never bleeds across threads or workspaces.
- Items disappear when Pi consumes them. When the run completes, stops, fails, or becomes inactive, stale queue and edit state are cleared.
- Queue mutations that fail leave the last confirmed queue visible, keep recoverable composer content intact, and show an actionable error without stopping the active run.
- Empty text with attachments remains a valid queued item. Empty text without attachments cannot be added or saved.
- Keyboard users can reach every item and action in visible order. Edit state and queue changes are announced without moving focus unexpectedly.
- The queue remains usable at narrow window widths, uses existing theme and typography tokens, and does not push the composer off-screen without providing bounded scrolling.

## Implementation Constraints and Settled Decisions

- Pi owns delivery and ordering. The agent host may keep only an ephemeral mirror needed to present and mutate the active Pi queue; it must not create a second persisted queue.
- Every mutation applies to Pi first and returns the resulting ordered snapshot. React replaces its local presentation with that confirmed snapshot rather than independently replaying mutations.
- Queue items require stable IDs while pending. Editing and mode changes preserve IDs; newly queued items receive one ID at the host boundary if Pi does not provide one.
- Existing `steer`, `followUp`, queue inspection, and whole-queue replacement seams are reused. Do not add a second queue protocol or another runtime abstraction.
- Queue editor state belongs to the thread feature. The composer remains the only text and attachment editor.
- Beginning an edit snapshots the current composer draft and attachments. Only one queued item may be edited at a time.
- Submit during edit means replace, not append, then restore the pre-edit composer snapshot. Ordinary Send and Steer retain their current meaning when no queued item is being edited.
- Promote-to-steer is one-way in the first slice, matching the reference behavior and avoiding an unnecessary mode editor.
- Delete is immediate and has no confirmation dialog. The action is explicit, scoped to one pending item, and does not delete transcript history.
- Attachment display reuses the existing attachment model and bounded preview behavior. Queue UI does not reread arbitrary files from React.
- Queue state is transient. Draft persistence may retain the user's unrelated composer draft, but must not serialize Pi's pending queue as app-owned durable state.
- The editor composes above the current composer inside the chat column. It is not placed in Settings, Changes, or a new permanent pane.

## Validation Evidence

- Agent-host contract tests prove append, inspect, replace, delete, promote, stable IDs, ordering, attachment preservation, invalid input rejection, and queue clearing after terminal run states.
- Frontend state tests prove per-thread isolation, confirmed-snapshot replacement, stale-response handling, and rollback after failed mutations.
- Edit-flow tests prove draft and attachment snapshot, replacement in place, cancel restoration, delete-while-editing, empty-item validation, and no accidental append.
- Component tests prove ordered cards, delivery labels, attachment treatments, action availability, bounded overflow, keyboard access, focus stability, and status announcements.
- Integration coverage switches between two running threads and confirms each queue remains isolated and refreshes after Pi consumes an item.
- A real Tauri smoke run queues follow-up and steer messages, edits and deletes pending work, observes Pi consume the final order, and verifies the active run is uninterrupted.
- Strict typechecks, focused frontend and agent-host tests, production build, and Cosmos export pass.

## Risks and Open Questions

- Pi may consume a steer while the user is attempting to edit it. A stale mutation must fail safely, refresh the confirmed queue, and preserve the user's edited content as a recoverable draft.
- Queue changes can arrive while a different thread is selected. Responses and events must be keyed by thread and must not overwrite the selected thread's state.
- Large or numerous attachments can make the queue tall. Previews and the queue region must stay bounded without hiding delivery order or actions.
- No product decision remains open for the first implementation slice.
