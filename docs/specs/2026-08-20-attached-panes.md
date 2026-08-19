# Attached Pane Groups

Status: approved for implementation, 2026-08-20.

Amends the strip and terminal behavior in
[2026-08-15-shell-navigation.md](2026-08-15-shell-navigation.md) and
[2026-08-15-git-terminal.md](2026-08-15-git-terminal.md).

## Outcome

Turn a strip column into a host for smaller, zero-gap panes. A host and its
attachments read as one visual group and are centered as one navigation entity.
The first attachment type is a real terminal; the seam must admit other pane
types later.

## Settled decisions

### Attachment ownership

- Chat and buffer columns can both host attached panes.
- A chat may have its own terminal instance; terminals are not restricted to one
  workspace-wide singleton.
- A terminal is an independent pane instance. It can be detached from one host
  and docked to another chat or buffer without becoming a new terminal.
- The host and its attachments remain separately focusable. The focused surface
  is bright and the other surfaces in the group are dimmer.
- Strip navigation centers the complete attached group, not an attachment by
  itself.

### Attachment cardinality

- A host has zero or one attached pane.
- Multiple panes cannot be displayed on the same host, including multiple
  terminals.
- Future pane types share this single attachment slot; extensibility means new
  pane kinds can use the contract, not that a host becomes a multi-pane grid.

### Navigation and rearrangement

- `h` and `l` move focus through the visible panes in visual left-to-right
  order, including between a host and its attachment.
- A focused attachment moves magnetically through the strip with repeated
  `Shift-H` and `Shift-L`. The first move in the host's direction crosses to the
  opposite side of that host; the next outward move docks it on the inward side
  of the adjacent host.
- Re-docking preserves the terminal instance, process, scrollback, and TERM
  focus. It does not create a replacement terminal.
- A host whose single attachment slot is occupied blocks an incoming
  attachment; the move is a no-op.
- When a host is focused, `Shift-H` and `Shift-L` move the complete host group
  through strip order. Its attachment remains docked on the same side.
- Changing focus never recenters one half by itself. The complete group remains
  the centered navigation entity; focus is conveyed by the brighter active
  surface and dimmer inactive surface.

### Default width ratio

- An attached group uses an automatic `2:1` split: the host receives two parts
  of the available group width and the attachment receives one part.
- The ratio is not manually resizable in the first release.
- At the current `780px` host target, the corresponding terminal target is
  `390px`; attaching a pane expands the centered entity rather than subdividing
  the old single-column width.

### Narrow-window fallback

- The smallest simultaneous split is `640px` for the host and `320px` for the
  attachment.
- When the available centered area cannot fit both minimums, only the focused
  member is drawn at the normal full-column width.
- `h` and `l` still move focus between the hidden partner and visible member;
  switching focus swaps which member is drawn.
- The attachment remains attached during this fallback. Resizing back above the
  threshold restores the simultaneous `2:1` group.

### Opening a terminal

- `t` acts on the focused host rather than on a workspace-wide terminal.
- If the host's attachment slot is empty, `t` creates a new terminal on the
  host's right, focuses it, and enters TERM mode.
- If that host already has a terminal, `t` focuses the existing instance and
  enters TERM mode; it does not create another process.
- If a future non-terminal pane occupies the slot, `t` changes nothing and
  reports that the attachment slot is occupied through the app toast system.
- To create a terminal for a different chat or buffer, focus that host before
  pressing `t`.

### Closing a host or terminal

- Closing an attached terminal kills that terminal process and removes the
  attachment while leaving its host open.
- Closing a host with an attached terminal closes both surfaces and kills the
  terminal process.
- Closing an attached host always requires one confirmation dialog, even when
  the terminal is idle. The dialog explicitly says that the attached terminal
  will also close.
- If the terminal has a foreground process, the same dialog includes the
  existing busy-process warning; the app must not stack a second confirmation.
- Cancel leaves the host, attachment, process, focus, and layout unchanged.
- A user who wants to preserve the terminal must re-dock it before closing its
  current host.

### Persistence across app restart

- Persist each attachment's pane type, stable pane identity, host identity, and
  left/right side.
- Restore terminal attachments into the same layout after an app restart.
- Terminal processes and scrollback do not survive app shutdown. A restored
  terminal starts a fresh login shell in the workspace root under the existing
  terminal process contract.
- Restoration must not claim or visually imply that the old process resumed.
- If the saved host no longer exists or its single attachment slot is occupied,
  skip that attachment instead of choosing another host.
- Report all skipped terminal restorations with one app toast after restoration;
  do not show one toast per terminal.
- A skipped attachment record is discarded so the same invalid restoration does
  not recur on every launch.

### Terminal startup failure

- Terminal creation is transactional: do not retain the attachment unless the
  pty starts successfully.
- On failure, remove the attempted attachment, focus its host, and return to the
  host's normal mode (`NORMAL` for a buffer, `OCARINA` for a chat).
- Show the failure through the app toast system and retain diagnostic detail in
  the application log.
- The attachment slot is immediately reusable; pressing `t` retries with a new
  terminal instance.

## Acceptance behavior

- `t` on a chat or buffer creates a distinct terminal attached on its right;
  pressing it again focuses the same terminal.
- A workspace can run several attached terminals at the same time without
  mixing their input, output, resize, busy, or kill operations.
- The host and terminal render edge-to-edge as one centered strip group at a
  `2:1` ratio, with the focused pane brighter than its partner.
- Below `960px` of usable width, only the focused member is visible at normal
  column width and `h` / `l` swaps the visible member.
- `h` / `l` follows visual pane order. Repeated `Shift-H` / `Shift-L` moves a
  terminal across its host and then into the adjacent empty host slot.
- Closing a terminal leaves its host. Closing an attached host presents one
  dialog that says the terminal will close too and includes any busy warning.
- Restart restores the host, side, and pane identity with a fresh shell. Invalid
  saved attachments are discarded and summarized by one toast.
- A terminal startup failure removes the attempted attachment, restores host
  focus and mode, and raises an error toast.

## Validation

Keep validation deliberately small for this visual-first iteration:

- Run the narrow unit test file owned by each ticket.
- Run `pnpm check` once after the final ticket.
- The owner performs the visual review in the real app after handoff.
