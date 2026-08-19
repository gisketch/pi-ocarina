# Thread titles — the machine's first guess, and the hand that overrules it

2026-08-19. Two doors to one name:

- **Auto**: the first prompt of a nameless session goes, in parallel with the
  turn it started, to a small model whose one job is a one-line title
  (Claude Code's shape: background call, generated once, never regenerated).
- **Manual**: `⇧R` in NORMAL opens a rename dialog on the focused thread.
  A hand-given name is final — the titler never overwrites one.

## Where the name lives

pi's own session file. `SessionManager.appendSessionInfo(name)` writes a
`session_info` entry; `workspaces.ts` already reads it back as
`session.name ?? firstLine(firstMessage) ?? 'untitled'`. No new store, no
migration, nothing to drift.

## The titling model

`pickTitleModel` (`src/main/session/thread-title.ts`): the reader's
`titles.model` from `~/.piocarina/config.json` wins; without one, GPT-5.6
Luna when pi has it; otherwise the cheapest model by input cost. Credentials
stay pi's — the app only names a model. `titles.enabled: false` turns the
auto titler off; the manual rename always works.

```json
{ "titles": { "model": "provider/id", "enabled": false } }
```

## Changed

- `src/shared/config-file.ts` — `titles` entry, validated per line like keys.
- `src/shared/commands.ts` — `renameThread`.
- `src/shared/protocol.ts` — `titled` event: how a new name reaches an open
  column without a re-list.
- `src/main/session/thread-title.ts` — `sanitizeTitle` (undress quotes,
  prefixes, trailing period; one line; cap 80), `pickTitleModel`,
  `wantsTitle` (first prompt + `getSessionName() === undefined`), `autoTitle`
  (fire-and-forget, silent on failure), `renameThread`.
- `src/main/session/session-factory.ts` — `oneShot(cwd, model?)`: in-memory
  session, `tools: []`, child-style model fallback. Not `child()` — a titler
  must not be able to raise an approval card.
- `src/main/session/pi-driver.ts` — `prompt` case fires the titler beside the
  turn; `renameThread` case; `useTitles` wired in `main/index.ts`.
- Renderer — `titled` → `catalog.retitle` (reducer ignores it); `R` →
  `renameThread` action (`keyboard.ts`, remappable as `thread.rename`);
  `rename-ask.svelte.ts` + `RenameAsk.svelte` (WorktreeAsk's shape), ranked
  in `key-routing` under the worktree question; `.title` in `ThreadColumn`
  now one line, ellipsis, never wraps.

## Validation

`thread-title.test.ts` (sanitize, model pick, when it runs), config parse
cases, keyboard `⇧R` case — suite green, svelte-check clean. Harness pass:
`R` opens prefilled, types, escapes. Live pass owed: auto title on a real
first message, rename persisting across relaunch.
