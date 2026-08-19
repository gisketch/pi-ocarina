# Rebindable keymaps, all of them, from Settings

Status: **GRILLED 2026-08-19.** The three load-bearing decisions (save target,
coverage, collision policy) were asked and answered by the owner. The rest are
agent-settled with reasons; any is cheap to overturn before implementation.

Supersedes the "no in-app keybinding editor, ever" decision in
`2026-08-16-keymap-and-hooks.md`. That decision was conditional — "unless the
app starts writing a file the reader owns" — and this spec meets the condition
by giving the app a file of its own.

## Problem

Only 23 actions are rebindable today, and only by hand-editing
`~/.piocarina/config.json` and restarting. The other ~40 keys — `G`, `i`, `a`,
`s`, `y`, ctrl-d/u, digits, arrows, every DIFF key — are raw `case` lines in
`src/renderer/src/lib/keyboard.ts`. A reader who wants `;` instead of `l` edits
source or lives with it.

## Desired outcome

Every action in every mode is a named, rebindable action. A reader opens
Settings → Keymaps, sees every action with its current key, presses the row,
presses the new key, and the binding works immediately — no restart, no JSON
by hand. The bindings persist in a JSON file that can be copied to another
machine.

## Owner decisions — 2026-08-19

### The app writes its own file: `~/.piocarina/keymap.json`

`config.json` stays exactly as the old spec left it: hand-authored, read at
launch, never rewritten by the app. The Keymaps UI writes
`~/.piocarina/keymap.json`, which the app owns the way it owns the catalog.

Precedence, weakest first: shipped defaults → `keymap.json` (the UI's writes)
→ `config.json` `keys` entries. **Hand beats UI.** A reader who wrote a
binding by hand meant it; the UI shows such bindings as locked ("set in
config.json") rather than silently fighting them.

Accepted cost: two places a binding can live. The UI names the winner on every
row, so the split is visible, never mysterious.

### Everything is rebindable except `Escape`

All modes — NORMAL, READ, DIFF, LEADER — including mode-entry keys (`i`,
enter) and chord digits. Only `Escape` stays fixed, as the one universal way
out. One fixed key is enough to stay recoverable: whatever a reader does to
their keymap, `Escape` still climbs back to NORMAL, and NORMAL can always
reach Settings by pointer.

This narrows the old spec's fixed set (Escape + every mode-entry key). The
non-QWERTY reader was the cost of that rule; this spec pays it back.

### Collision: steal, and flag the loser

Binding a key that another action in the same mode holds takes effect
immediately. The losing action becomes **unbound** and its row is highlighted
until the reader gives it a key. Nothing blocks, nothing is silent, and
rebinding a swapped pair (`h`↔`l`) is two captures, not a dance.

The remap model gives this for free: a stolen slot translates to its new
action, so the old action simply has no key pointing at it any more. Unbound
is derived, not stored.

Launch-time collisions *inside a file* (two hand-written bindings on one slot)
keep the old rule: both dropped, both reported.

## Agent-settled decisions

### One registry, and the reducer does not change shape

`SHIPPED_KEYS` grows into the single action registry: every reducer `case`
gets an entry — id, mode, default key, a short label, and a display group.
The reducer stays a pure switch over keys; `effectiveKey` translation extends
to all modes (today it already covers NORMAL/READ/LEADER slots — DIFF and the
chord digits join). The keymap stays an input to the reducer, never a lookup
inside it.

The `␣k` cheat sheet (`KeymapOverlay.svelte`) stops hardcoding its rows and
renders from the registry + live keymap, so it can never drift from reality
again.

### `keymap.json` shape

```json
{ "version": 1, "keys": { "thread.next": ";", "block.down": "n" } }
```

Action id → key. Mode is derivable from the action, so it is not repeated.
Keys are stored in the exact encoding the reducer receives (`event.key`, with
capitals meaning shift, and the press module's existing ctrl encoding). An
unknown action id or an `Escape` value is reported and skipped — the same
per-entry `ConfigProblem` manner `config.json` uses — and the file still
loads.

### Live apply, and how the write travels

The renderer edits its keymap state and invokes a new `saveKeymap` command;
main writes `keymap.json` whole (write-temp-then-rename, the catalog's
habit). The new binding works on the next keypress — the rebuilt `Keymap` is
already in the renderer. Restart only replays the same file.

### Capture

A row is armed by pressing enter (or click) on it; the next keydown becomes
the binding, shown immediately. `Escape` cancels capture — which is *why* it
cannot be captured. Bare modifiers do not land (the rename dialog's
`MODIFIER_KEYS` rule). While any capture is armed, the shell's key routing is
held, the way modals already hold it.

### Reset

Per-row reset to the shipped default, and one "reset all" that empties
`keymap.json`. Neither touches `config.json` — hand bindings survive a reset,
still locked, still labeled.

## Out of scope

- Multi-key sequences beyond the existing leader chord.
- Per-workspace keymaps.
- Rebinding `Escape`.
- Editing `config.json` from the app, ever.
- A migration of `config.json` `keys` into `keymap.json`.

## Acceptance behavior

- Every reducer key appears in Settings → Keymaps with its current binding.
- Capture a new key on a row → the binding works on the very next keypress,
  no restart, and survives a restart.
- Stealing a key unbinds the loser, whose row is flagged until rebound.
- A `config.json` `keys` entry wins over the UI and shows as locked.
- `Escape` cannot be captured, and always exits capture and every mode.
- A malformed `keymap.json` names its problems, loads its valid entries, and
  the app starts.
- `␣k` shows the keys that are actually live, including the reader's.

## Validation

- Registry test: every reducer `case` key has exactly one registry entry, and
  every registry default reaches its action through `effectiveKey` (a
  completeness test that fails when someone adds a key without registering it).
- Reducer tests over a full-coverage keymap: a stolen key, a swapped pair, an
  unbound action, a DIFF and a digit rebind.
- Parser tests for `keymap.json`: unknown action, `Escape` value, duplicate
  key in one mode, version absent.
- Precedence test: same action in `keymap.json` and `config.json` — hand wins.
- Harness pass: rebind in the UI, press the key, restart, press again.
