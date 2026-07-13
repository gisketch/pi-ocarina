# Workspace Sidebar Disclosures

## Problem and desired outcome

Workspace rows currently navigate immediately, mix disclosure with selection, and hide project actions elsewhere. Turn each workspace row into a compact disclosure header so users can inspect threads, start work, and manage the workspace without accidentally switching projects.

## Scope

In scope:

- Workspace rows expand and collapse their thread lists without selecting the workspace.
- One folder silhouette identifies every workspace: outline when expanded and filled when collapsed.
- Hovering or focusing a workspace row reveals an ellipsis action menu followed by a plus button.
- Plus opens a new-thread view in that workspace.
- Root-project and worktree action menus reuse existing workspace operations.
- `Pi` remains white while `Ocarina` follows the selected project's chat color.

Out of scope:

- Persisting disclosure state across app restarts or windows.
- Drag-reordering workspaces, bulk actions, unrelated custom icons, or new native workspace commands.
- Changing thread-row actions, thread identity, or project color seeding.

## Acceptance criteria

- All workspace rows start expanded to preserve the current visible-thread behavior; expansion state remains local for the current mounted sidebar.
- Activating the workspace disclosure row toggles only that workspace and exposes `aria-expanded`; it never selects the workspace or changes the chat.
- Expanded rows use the existing outline folder icon and render their thread list. Collapsed rows use the same folder silhouette filled inside and remove their thread list from layout and keyboard navigation.
- Only the selected workspace's disclosure icon uses project color. Inactive disclosure icons and every workspace/thread label remain foreground-white.
- Hover or keyboard focus within a workspace header reveals ellipsis then plus controls without shifting the label or changing row height.
- Activating ellipsis or plus does not toggle disclosure.
- Plus on the selected workspace opens its new-thread view. Plus on another workspace selects it and completes the handoff into its new-thread view.
- A root project menu contains Rename, Reveal in Finder, Create Worktree, and destructive Remove Project. Create Worktree is disabled when its existing model prerequisite is unavailable.
- A worktree menu contains Rename, Reveal in Finder, and destructive Remove Worktree. Existing confirmation and dirty-worktree protections remain authoritative.
- Clicking an expanded thread in another workspace still selects that workspace and opens that thread.
- `Pi` is white and `Ocarina` updates immediately to the selected project's color, matching the chat identity.
- All disclosure, plus, and menu controls have accessible names, visible keyboard focus, and correct menu semantics.

## Implementation constraints and settled decisions

- Reuse the existing Pixelarticons wrapper, dropdown menu, workspace commands, dialogs, worktree flow, and thread handoff rather than introducing new dependencies or native APIs.
- Derive one repo-owned filled-folder SVG from the installed Pixelarticons folder geometry because the package has no filled state. Keep its dimensions and silhouette identical to the outline icon; do not add a generic filled-icon API.
- Keep disclosure state as a set of collapsed workspace IDs in the sidebar. New workspace IDs therefore default expanded without synchronization or persistence.
- Keep workspace selection owned by the existing Tauri command. Represent cross-workspace new-thread intent with the same bounded session handoff pattern used for opening a thread.
- Render row actions in a fixed trailing action area whose controls transition visibility on hover and `focus-within`; hidden controls must not remain keyboard-focusable.
- Root projects are workspaces without `root_workspace_id`; worktrees are workspaces with it. Menu contents derive from that existing distinction.
- Project color remains presentation-only. Apply it to the selected disclosure icon and `Ocarina`, not labels or inactive icons.

## Validation evidence

- Focused state tests cover all-expanded initialization, independent toggles, and new workspace default behavior.
- Handoff tests cover selected-project and cross-project new-thread actions without opening a stale thread.
- Component fixtures cover expanded/collapsed, selected/inactive, hover actions, root menus, worktree menus, and dynamic `Ocarina` color.
- Keyboard checks cover disclosure, revealed actions, dropdown navigation, focus visibility, and collapsed content removal.
- Frontend unit tests, typecheck, lint, production build, and Cosmos export pass.

## Risks and open questions

- A workspace with many threads can still make an all-expanded sidebar long; persistence or smarter defaults can be added only if observed use warrants it.
- Cross-project new-thread handoff must clear failed or stale intent using the existing defensive handoff rules.
- No open product decisions block implementation.
