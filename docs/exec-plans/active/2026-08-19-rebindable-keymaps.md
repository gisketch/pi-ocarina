# Rebindable keymaps — tickets

Spec: `docs/specs/2026-08-19-rebindable-keymaps.md`. Owner approved 2026-08-19.

Status: **T1–T5 implemented and harness-verified 2026-08-19.** Editor keys as
built: j/k (and arrows) move, h/l hop groups, ⏎/␣ records, r resets the row,
⇧R twice resets all, esc cancels a recording before it closes the screen.
Recording routes through the modal key gate (`key-routing`), which is what
lets the next press be `w` or `esc` without the shell reading either.

Repo facts the slices lean on:

- The remap is already generic: `shell.svelte.ts` applies `effectiveKey(keymap,
  mode, key)` before `reduceKey` for every mode. Registering an action is all a
  NORMAL/READ/LEADER key needs to become rebindable.
- Ctrl chords (`^d`/`^u`) bypass the remap today — `effectiveKey` sees only
  `event.key`. A press encoding is needed.
- DIFF keys do not live in the reducer at all: the changes viewer
  (`changes.svelte.ts`) reads raw keys in its own `handleKey`.
- Digits are positional (`digitFor`), not named keys. They stay fixed, like
  `Escape`. (Amends the spec's "digits join" line — a row per digit is noise,
  and rebinding "3" is not a real ask.)

## T1 — press encoding and the full registry

**Delivers:** every reducer-owned key (NORMAL, READ, LEADER, plus `^d`/`^u`,
`⇧H`/`⇧L`, `d`, overlay keys, mode-entry `i`) is a named action, rebindable
from `config.json` today.

- `keymap.ts`: `SHIPPED_KEYS` grows into the registry — id, mode, default
  press, label, group (for the UI and the cheat sheet).
- Press encoding: `C-d` means ctrl+d. `encodePress(event)` /
  `decodePress(press)` beside the keymap; the shell encodes before
  `effectiveKey` and decodes the translation back into a `KeyEventLike`.
- Completeness test: every `case`/map key in `keyboard.ts` reachable through a
  registry default, and every registry default lands on its action.

**Accept:** hand-bind `z` → `scroll.down` in config.json; `z` scrolls, `^d`
still scrolls until stolen. All old bindings unchanged with an empty config.

## T2 — DIFF joins the remap

**Delivers:** the changes viewer's keys are registry actions.

- Registry rows for the viewer's keys (`j k h l g G n N y /`, mode `DIFF`).
- `changes.handleKey` translates through `effectiveKey(keymap, 'DIFF', press)`
  first — except while `filtering`, when keys are text.

**Accept:** bind `p` → diff previous file; works; `/` filter still types.

## T3 — keymap.json: parse, load, save, precedence

**Delivers:** a UI-owned file that persists and applies live.

- `shared/keymap-file.ts`: parse `{ version, keys: {action: press} }` with
  per-entry `ConfigProblem`s (unknown action, `Escape`, bad shape).
- `main/keymap-store.ts`: load at launch; `save(keys)` writes
  temp-then-rename. IPC `keymap:load` / `keymap:save` on the bridge.
- Renderer: merge shipped → keymap.json → config.json `keys` (hand wins) into
  one `Keymap`; rebuild + hand to `shell.keymap` on load and after save.

**Accept:** hand-written keymap.json applies at launch; a `saveKeymap` call
round-trips; a config.json binding for the same action wins.

## T4 — Settings → Keymaps editor

**Delivers:** the screen. Settings row "keymaps · edit" opens it.

- New overlay `keybinds` (in `TYPING_OVERLAYS` — it owns every key).
- Rows grouped by registry group; each shows label + current press + source
  chip (`shipped` / `yours` / `config.json`-locked).
- Keys: `j/k` (and arrows) move, `h/l` jump groups, `⏎`/`space` arms RECORD
  on the row — the row shows a recording chip; the next keydown binds.
  `Escape` cancels RECORD (and is never capturable); bare modifiers do not
  land. `r` resets the row; `⇧R` resets all (with confirm). Locked rows
  refuse RECORD and say why.
- Steal: binding a held press unbinds the loser; its row shows `unbound`
  highlighted until rebound.
- Every change saves through T3 and applies on the next keypress.

**Accept:** open editor, rebind `thread.next` to `;`, press `;` immediately —
column moves; restart — still `;`; steal `h`, see the loser flagged.

## T5 — the ␣k cheat sheet stops lying

**Delivers:** `KeymapOverlay.svelte` renders groups from the registry + live
keymap instead of hardcoded rows. The reader's rebinds show.

**Accept:** rebind a key, `␣k` shows the new one.

Blocked-by: T1 ← nothing; T2 ← T1; T3 ← T1; T4 ← T3; T5 ← T1 (better after T3).
