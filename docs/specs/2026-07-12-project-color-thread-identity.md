# Project Color and Thread Identity

## Problem and desired outcome

Threads currently share one global primary color, making projects difficult to distinguish at a glance. Give each root project a stable, vivid identity on the dark interface while keeping individual threads recognizable.

## Scope

In scope:

- A curated OLED-friendly palette containing blue, cyan, green, yellow, orange, red, purple, and pink.
- One deterministic color per root project, shared by its root workspace, worktrees, and all their threads.
- One deterministic Matrix avatar shape per thread. Thread avatars use their project's color.
- Project color applied as the primary token only within the selected chat surface, including transcript accents, selection styling, focus rings, and the composer send button.
- Thread avatars shown as the leading icon in each sidebar thread row without displacing running, unread, or attention state.
- Each sidebar project label/icon and its selected thread and status accents use that project's color; unrelated sidebar controls retain the global theme.
- A dedicated 5×5 animated procedural-avatar component with two closely related deterministic frames, rendered crisply in the sidebar's 14px leading icon slot and animated only while its thread is running.

Out of scope:

- User-selected or persisted color overrides.
- Random colors outside the curated palette.
- Recoloring the application shell, global sidebar controls, terminal, review UI, semantic success/warning/danger states, or syntax highlighting.
- Custom avatar editing or avatar image storage.

## Acceptance criteria

- Reopening the app, renaming a project, or renaming a thread does not change its color or avatar.
- A root workspace and every worktree whose `root_workspace_id` points to it render the same project color.
- Different root projects are mapped deterministically to the curated palette; collisions are allowed when the project count exceeds the palette or hashes collide.
- Every established thread displays a deterministic Matrix avatar in the leading icon slot of its sidebar row. Threads in one project share color but normally have different shapes.
- A running thread's avatar loops between its two frames at 600ms per frame using a hard step with no fade or interpolation. An idle thread shows the first frame, and reduced-motion preference disables the loop.
- A new-thread view uses its project color and shows no fabricated persistent thread avatar before Pi creates a thread identity.
- Switching projects updates the selected chat surface immediately without leaking that project's color into unrelated application surfaces.
- Sidebar project labels and icons match their avatars, selected threads, unread marks, and attention marks.
- Switching workspaces preserves the last known sidebar thread rows while fresh summaries load, avoiding a transient collapsed layout.
- The send button, user-message tint, links, selection, and focus treatment inside the chat surface follow the active project color while retaining readable foreground contrast.
- Running, unread, attention, destructive, warning, and success meaning remains distinguishable and accessible; avatar decoration is not the sole carrier of state.

## Settled implementation decisions

- Keep the existing global theme as the fallback. Resolve a project identity from `root_workspace_id ?? id`, hash it with a small deterministic function, and index into a fixed ordered palette.
- Derive presentation values at runtime. Do not add color or avatar fields to persisted workspace/thread contracts in this version.
- Define the palette and seed-to-color resolver in one framework-neutral appearance module. Each palette entry supplies a stable name, primary color, and readable foreground; UI code consumes the result rather than duplicating color literals.
- Scope both source tokens and their resolved Tailwind aliases on the chat container and each sidebar project section. This keeps project identity consistent without recoloring unrelated controls.
- Reuse the existing Matrix avatar primitive. Seed avatar geometry from `threadId`, falling back to `sessionFile` only when a summary has no thread ID; use resolved project color instead of the primitive's free-hue avatar color.
- Build a separate animated procedural-avatar component on the existing Matrix primitive. Derive frame two from the same seed by toggling exactly one deterministic mirrored cell pair so symmetry and identity remain recognizable; use a two-step CSS loop only when `running` is true.
- The avatar permanently owns the sidebar row's leading icon slot and becomes the running indicator through animation. Preserve unread and attention indicators as overlays or adjacent marks so status never replaces thread identity.

## Validation evidence

- Unit checks prove deterministic palette selection, membership in the curated palette, root/worktree color inheritance, rename stability, and deterministic/distinct thread avatar seeds.
- Unit checks prove both 5×5 avatar frames are deterministic and valid, with frame two differing by exactly one mirrored cell pair.
- Component fixtures show every palette color on the dark chat/composer surface and thread rows containing normal, selected, running, unread, and attention states.
- Interaction validation switches between at least two projects and confirms computed chat primary tokens change while shell tokens remain unchanged.
- Automated accessibility checks cover button names, avatar decoration semantics, visible focus, and contrast for primary foreground content across every palette entry.
- Repository quality commands pass.

## Risks and open questions

- Small palettes necessarily produce color collisions. Manual overrides can be added later only if real project counts make collisions confusing.
- OLED vividness and perceived contrast vary by display. Palette values should be tuned through the component fixtures before release, without changing the identity contract.
- Richer avatar motion is deferred until the two-frame running treatment proves insufficient.
- No open product decisions block implementation.
