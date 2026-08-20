/** The perf harness behind `pnpm bench`.
 *
 *  Each workload drives the same public seam a component drives, with a fixed
 *  deterministic fixture, and reports milliseconds. Run before and after a
 *  perf change and compare rows — the workloads are the acceptance criteria
 *  of `docs/specs/2026-08-20-performance-snappy.md` made executable.
 *
 *  Not part of `pnpm test`: timing must never fail CI. */
import { describe, it } from 'vitest'
import { parseMarkdown } from '../../src/renderer/src/lib/markdown'
import { segmentsOf } from '../../src/renderer/src/lib/markdown-segments'
import { highlightBlockCached } from '../../src/renderer/src/lib/highlight-cache'
import { navBlocks } from '../../src/renderer/src/lib/blocks'
import { visibleBlocks } from '../../src/renderer/src/lib/thread-rows'
import { fuzzyFilter, fuzzyNarrower } from '../../src/renderer/src/lib/fuzzy'
import type { Block, ToolRow } from '../../src/renderer/src/lib/thread'

const results: { workload: string; ms: number; note: string }[] = []

function time(workload: string, note: string, run: () => void): void {
  run() // warm the JIT once; the second pass is the number
  const start = performance.now()
  run()
  results.push({ workload, ms: Math.round((performance.now() - start) * 100) / 100, note })
}

/** ~600 chars of prose with inline code, like a real agent paragraph. */
function prose(seed: number): string {
  const sentence =
    `The reducer at step ${seed} keeps \`mode\` pure and hands back actions, ` +
    'so the shell can replay them headlessly without a DOM in sight. '
  return sentence.repeat(4) + '\n\nA second paragraph follows, with a list:\n- one\n- two\n'
}

function codeLine(at: number): string {
  return `export function step${at}(input: string): number { // carries ${at}\n`
}

function messages(count: number): Block[] {
  return Array.from({ length: count }, (_, at) => ({
    kind: at % 2 === 0 ? ('agent' as const) : ('user' as const),
    id: `m${at}`,
    text: prose(at),
  })) as Block[]
}

function ledgers(count: number): Block[] {
  return Array.from({ length: count }, (_, at) => {
    const rows: ToolRow[] = Array.from({ length: 10 }, (_, r) => ({
      id: `r${r}`,
      kind: r < 3 ? 'think' : 'read',
      target: `src/lib/file-${r}.ts`,
      status: 'done',
    }))
    return { kind: 'ledger' as const, id: `l${at}`, rows }
  })
}

describe('perf workloads', () => {
  it('B1 · streaming turn: message parse + nav list per batch', () => {
    const thread = messages(100)
    time('B1 stream+nav', '100 batches × (message parse + navBlocks over 100 msgs)', () => {
      let text = ''
      for (let batch = 0; batch < 100; batch += 1) {
        text += prose(batch).slice(0, 200)
        const streaming: Block = { kind: 'agent', id: 'live', text, streaming: true }
        segmentsOf(parseMarkdown(text)) // Message.svelte's derived
        navBlocks([...thread, streaming]) // ThreadView + block-nav per token/keypress
      }
    })
  })

  it('B2 · streaming fence: tokenize per batch', () => {
    time('B2 fence-stream', '50 batches growing a 400-line ts fence', () => {
      let text = ''
      for (let batch = 0; batch < 50; batch += 1) {
        for (let line = 0; line < 8; line += 1) text += codeLine(batch * 8 + line)
        highlightBlockCached(text, 'ts') // Fence.svelte's lines
      }
    })
  })

  it('B3 · thinking filter: identity churn per token', () => {
    const blocks = [...ledgers(150), ...messages(150)]
    let fresh = 0
    time('B3 thinking-filter', '100 tokens × 300 blocks (150 ledgers w/ think rows)', () => {
      fresh = 0
      let last: Block[] | null = null
      for (let token = 0; token < 100; token += 1) {
        // A token replaces the blocks array, as the reducer does, so the list
        // memo misses — what must hold is per-block identity across tokens.
        const shown = visibleBlocks(blocks.slice())
        if (last) for (let at = 0; at < shown.length; at += 1) if (shown[at] !== last[at]) fresh += 1
        last = shown
      }
    })
    results.push({ workload: 'B3 identities', ms: fresh, note: 'fresh block objects across the run (count, not ms)' })
  })

  it('B4 · held j: navBlocks per keypress', () => {
    const thread = messages(100)
    time('B4 nav-keypress', '200 keypresses × navBlocks over 100 msgs', () => {
      for (let press = 0; press < 200; press += 1) navBlocks(thread)
    })
  })

  it('B5 · file index: filter per keystroke', () => {
    const paths = Array.from(
      { length: 50_000 },
      (_, at) => `src/area-${at % 40}/module-${at % 700}/file-${at}.ts`,
    )
    time('B5 mention-filter', "50k paths, keystrokes 'a'→'ap'→'app' (completions seam)", () => {
      for (const query of ['a', 'ap', 'app']) {
        fuzzyFilter(paths, query, (path) => path).slice(0, 40)
      }
    })
    time('B5 picker-open', '50k paths, empty query (telescope narrower seam)', () => {
      const narrow = fuzzyNarrower<string>((path) => path)
      narrow(paths, '').slice(0, 50)
    })
    time('B5 picker-narrow', "50k paths, 'a'→'ap'→'app' through one narrower", () => {
      const narrow = fuzzyNarrower<string>((path) => path)
      for (const query of ['a', 'ap', 'app']) narrow(paths, query).slice(0, 50)
    })
  })

  it('prints the table', () => {
    const rows = results.map((row) => `| ${row.workload} | ${row.ms} | ${row.note} |`)
    console.info(['| workload | ms | note |', '|---|---|---|', ...rows].join('\n'))
  })
})
