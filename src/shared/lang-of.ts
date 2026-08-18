/** Which language a file is written in, by its name.
 *
 *  One map, two readers: the highlighter needs a grammar name for a `read`
 *  body, and the ledger needs an icon for a language-server row. Both were
 *  about to grow their own extension table, and two tables disagreeing about
 *  what `.mjs` is would be two different answers on the same row.
 *
 *  Names are the ones the highlighter's grammars use, so a name from here can
 *  be handed straight to it. An extension nobody claims returns an empty
 *  string, which every caller already treats as "say nothing". */

const BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'ts',
  tsx: 'tsx',
  mts: 'ts',
  cts: 'ts',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  svelte: 'svelte',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  py: 'python',
  pyi: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'zsh',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  java: 'java',
  php: 'php',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
}

/** The file's own name, with no directory. */
function baseName(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

export function langOf(path: string): string {
  const name = baseName(path)
  const dot = name.lastIndexOf('.')
  // A dotfile is not an extension: `.gitignore` is the whole name.
  if (dot <= 0) return ''
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? ''
}
