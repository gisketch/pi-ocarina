# LSP integration: the agent reads the program, not the text

Status: **APPROVED 2026-08-18.** Grilled 2026-08-18. Tickets in
[2026-08-18-lsp.md](../exec-plans/active/2026-08-18-lsp.md).

## Problem

The agent finds code by grepping it. Grep matches strings; the language server
understands the program. On a typed codebase this costs twice: the agent burns
tokens reading files a `references` call would have answered in one line, and it
edits blind — a rename that misses one call site compiles for nobody.

PiOcarina loads no language server, shows none, and its prompt never tells the
agent to prefer one.

## Desired outcome

A workspace opts into LSP. From then on the agent navigates and validates
through language servers, and reaches for grep only when they cannot answer. The
reader turns it on from **Workspace Settings**, sees which servers are installed
and which are missing, and reads the live state in the status bar.

## Settled decisions

### 1. Engine: our own client, `vscode-jsonrpc` for the wire

Every third-party `pi-lsp` package — samfoy, code-yeongyu, trotsky1997, arcdev
— is a **pi CLI extension**. It installs into `~/.pi/agent/extensions/` and
registers its tools when the pi *CLI* loads. None exposes a programmatic API.

PiOcarina embeds pi as an SDK (`createAgentSession`) and registers tools inline.
Reusing one of those would mean: a separate install the user performs and we
cannot verify, tool names and result shapes we cannot version, and — the
deciding fact — **no access to server state**, which the status bar and the
settings screen exist to show. We would be rendering a black box.

So we own the client. We do not own the wire: `vscode-jsonrpc@9` is Microsoft's
own JSON-RPC implementation, **zero runtime dependencies**, Node ≥14, stdio
native. It gives us `Content-Length` framing, request/response correlation,
notification dispatch and cancellation — the boring parts that are easy to get
subtly wrong. We write the pool, the tools and the surfaces.

This is the extensible answer: a language is a row in a table, not code.

### 2. A server is data, not a class

```
LspServerSpec = {
  id, label, extensions[], command, args[], rootFiles[], install{}
}
```

Shipped specs: TypeScript/JavaScript, Svelte, Python, Go, Rust, C#, JSON.
Workspace settings may add one or override a shipped one. Adding a language
ships as a table entry and a fixture, never as a new class.

### 3. Polyglot is the default case, not a mode

A dotnet + react repository runs `csharp-ls` and `typescript-language-server`
side by side. A file routes to a server by its extension. Each server starts
lazily on the first call that touches its language, and knows nothing of the
others. No "primary language" setting exists, because a repository does not
have one.

### 4. Opt in per workspace, and detection only *offers*

The switch lives on the workspace record beside the worktree settings. Default
off. Workspace Settings lists every shipped server whose `rootFiles` match this
workspace, each with a state:

- `ready` — the binary is on PATH.
- `missing` — it is not; the row shows the install command **to copy, never to
  run**. Installing software is the user's action, not ours.
- `off` — enabled for this workspace but switched off.

Detection never enables anything by itself.

### 5. Six tools, addressed by symbol name

`lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_symbols`,
`lsp_hover`, `lsp_rename_preview`.

They take a **path and a symbol name**, not a line and column. A model does not
know columns; making it guess produces retries, and every retry is a round trip
we were trying to avoid. We resolve the symbol through `documentSymbol` and use
its real position. An ambiguous name returns the candidates rather than picking
one.

`lsp_rename_preview` returns the edits and applies nothing. Applying belongs to
`edit`, which passes the approval gate; a rename that wrote behind the gate
would be a hole in it.

### 6. Model injection: three layers, because one does not hold

Proven by `spawn_agents`: a description alone loses to the model's habits.

1. **Tool guidelines** on the LSP tools (`promptGuidelines`), stating that this
   project has language servers and symbol questions go to them.
2. **The grep and find descriptions change** when LSP is on. `AgentTool` is a
   plain object, so the built-in is rebound with a description that names itself
   a fallback: strings, comments, configuration, and files no server covers.
   Grep is never removed — a fallback that does not exist is a lie.
3. **A system prompt line** through the resource loader, listing the live
   languages.

### 7. Diagnostics ride back on the edit that caused them

pi fires `tool_result` after a tool executes, and the handler may modify the
result. After a successful `edit` or `write` to a file whose server is already
running, that file's errors are appended to the result — capped at 10 lines,
errors only, that file only. The agent learns it broke the build in the same
turn it broke it, with no extra call.

If no server is running for that file, nothing is appended. We never start a
server to produce a diagnostic; that would put a cold start in the path of an
edit.

### 8. Lifecycle: lazy, reference-counted, reaped

A server starts on first use. Every call holds a reference; the count drops in a
`finally`. A server with no references and no use for five minutes is stopped. A
crashed server is evicted and retried **once for read-only calls only** — a
mutating call is never retried, because a half-applied rename is worse than a
failed one. Closing the workspace stops its servers.

### 9. The status bar says what is alive

A chip: `lsp 2` when two servers are running, dim `lsp` when enabled with none
started, absent when off, `lsp 1!` when one is degraded. It is a chip and not a
sentence because the bar is already full. The detail lives in Workspace
Settings, which the chip opens.

## In scope

- Workspace Settings: a second settings surface, scoped to the open workspace.
- The client, the pool, the server table, the six tools.
- Demotion of grep and find while LSP is on.
- Diagnostics injection on edit and write.
- The status bar chip and its ledger rows.

## Out of scope

- Installing language servers. We show the command; the user runs it.
- Editor features for the reader — hover, completion, go-to-definition in the
  UI. These tools are for the agent.
- Formatting, code actions, call hierarchy. Later, as table-driven additions.

## Acceptance behavior

- A workspace with LSP off behaves exactly as today.
- Turning it on and asking "who calls X" produces an `lsp_references` row.
- A dotnet + react repository runs both servers; each file routes to its own.
- A missing binary shows an install line in Workspace Settings and never blocks
  a turn — the tool says the server is unavailable and grep still works.
- An edit that breaks compilation carries the errors back in that edit's result.
- The status bar chip counts the running servers and opens Workspace Settings.
- A crashed server is restarted on the next read call, once.

## Constraints

- The renderer never speaks LSP. Servers live in main; the renderer receives
  rows, status and settings.
- Session start never waits on a server.
- Untrusted input: a server's output is data. A path from a server is validated
  against the workspace before it is shown or followed.
- A configured command is spawned without a shell.

## Validation

- Unit: the server table's routing, the pool's reference counting and reaping,
  symbol resolution, the demotion text, the diagnostics cap.
- A fake language server over a real `vscode-jsonrpc` pipe, so the client is
  tested against the protocol rather than against a mock of itself.
- A live pass on a polyglot fixture.
