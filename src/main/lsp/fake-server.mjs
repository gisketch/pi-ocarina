/** A language server that exists only to be talked to.
 *
 *  The framing is written by hand on purpose. Using `vscode-jsonrpc` on both
 *  ends would test the library against itself; writing `Content-Length` here
 *  proves our client speaks the protocol a real server speaks. */

let buffer = Buffer.alloc(0)

const send = (message) => {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

const reply = (id, result) => send({ jsonrpc: '2.0', id, result })

const range = (line, from, to) => ({
  start: { line, character: from },
  end: { line, character: to },
})

function handle(message) {
  const { id, method, params } = message

  switch (method) {
    case 'initialize':
      reply(id, { capabilities: { referencesProvider: true, renameProvider: true } })
      return

    case 'textDocument/didOpen':
      // A real server publishes when it is ready, not when it is asked.
      setTimeout(() => {
        send({
          jsonrpc: '2.0',
          method: 'textDocument/publishDiagnostics',
          params: {
            uri: params.textDocument.uri,
            diagnostics: [
              { range: range(2, 0, 5), severity: 1, message: "Cannot find name 'oops'." },
              { range: range(9, 0, 3), severity: 2, message: 'Unused variable.' },
            ],
          },
        })
      }, 5)
      return

    case 'textDocument/documentSymbol':
      reply(id, [
        {
          name: 'Ledger',
          kind: 5,
          range: range(0, 0, 20),
          selectionRange: range(0, 6, 12),
          children: [
            { name: 'draw', kind: 6, range: range(3, 2, 8), selectionRange: range(3, 2, 6) },
          ],
        },
        { name: 'total', kind: 12, range: range(15, 0, 4), selectionRange: range(15, 9, 14) },
        { name: 'draw', kind: 12, range: range(30, 0, 4), selectionRange: range(30, 9, 13) },
      ])
      return

    case 'textDocument/references':
      reply(id, [
        { uri: params.textDocument.uri, range: range(40, 2, 8) },
        { uri: 'file:///w/other.ts', range: range(7, 0, 6) },
      ])
      return

    case 'textDocument/definition':
      // The link shape, so the client's normalisation is exercised.
      reply(id, [
        {
          targetUri: params.textDocument.uri,
          targetRange: range(0, 0, 20),
          targetSelectionRange: range(0, 6, 12),
        },
      ])
      return

    case 'textDocument/hover':
      reply(id, { contents: { kind: 'markdown', value: 'class Ledger' } })
      return

    case 'textDocument/rename':
      reply(id, {
        changes: { [params.textDocument.uri]: [{ range: range(0, 6, 12), newText: params.newName }] },
      })
      return

    case 'shutdown':
      reply(id, null)
      return

    case 'exit':
      process.exit(0)
      return

    default:
      if (id !== undefined) reply(id, null)
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  for (;;) {
    const split = buffer.indexOf('\r\n\r\n')
    if (split === -1) return

    const header = buffer.subarray(0, split).toString('ascii')
    const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1] ?? 0)
    const start = split + 4
    if (buffer.length < start + length) return

    const body = buffer.subarray(start, start + length).toString('utf8')
    buffer = buffer.subarray(start + length)

    try {
      handle(JSON.parse(body))
    } catch {
      // A malformed frame is the test's problem, not this fixture's.
    }
  }
})
