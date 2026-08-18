import { describe, expect, it } from 'vitest'
import type { RuleEntry } from '../../shared/config-file'
import { ruleVerdict, subjectOf } from './rule-policy'

const cwd = '/repo'
const allow = (tool: string, match: string, workspace?: string): RuleEntry => ({
  effect: 'allow',
  tool,
  match,
  ...(workspace ? { workspace } : {}),
})
const deny = (tool: string, match: string): RuleEntry => ({ effect: 'deny', tool, match })

describe('what a rule matches against', () => {
  it('is the command for bash and the path for everything else', () => {
    expect(subjectOf('bash', { command: ' pnpm test ' })).toBe('pnpm test')
    expect(subjectOf('write', { path: 'src/a.ts' })).toBe('src/a.ts')
    expect(subjectOf('edit', { file_path: 'src/b.ts' })).toBe('src/b.ts')
    expect(subjectOf('fetch', { url: 'https://x' })).toBe('https://x')
  })
})

describe('an allow', () => {
  it('covers the command it names and the arguments after it', () => {
    const rules = [allow('bash', 'pnpm test')]
    expect(ruleVerdict(rules, 'bash', { command: 'pnpm test' }, cwd)).toBe('allow')
    expect(ruleVerdict(rules, 'bash', { command: 'pnpm test --run' }, cwd)).toBe('allow')
  })

  it('says nothing about a command it does not cover', () => {
    expect(ruleVerdict([allow('bash', 'pnpm test')], 'bash', { command: 'rm -rf x' }, cwd)).toBe(
      'nothing',
    )
  })

  it('says nothing about a different tool', () => {
    expect(ruleVerdict([allow('bash', 'pnpm')], 'write', { path: 'pnpm-lock.yaml' }, cwd)).toBe(
      'nothing',
    )
  })

  it('covers every tool when it says so', () => {
    expect(ruleVerdict([allow('*', 'src/')], 'write', { path: 'src/a.ts' }, cwd)).toBe('allow')
  })
})

describe('a workspace rule', () => {
  it('applies in its own workspace only', () => {
    const rules = [allow('bash', 'pnpm test', '/repo')]
    expect(ruleVerdict(rules, 'bash', { command: 'pnpm test' }, '/repo')).toBe('allow')
    expect(ruleVerdict(rules, 'bash', { command: 'pnpm test' }, '/elsewhere')).toBe('nothing')
  })

  it('is not needed for a rule meant everywhere', () => {
    expect(ruleVerdict([allow('bash', 'pnpm test')], 'bash', { command: 'pnpm test' }, '/x')).toBe(
      'allow',
    )
  })
})

describe('a deny', () => {
  it('beats an allow, whatever order they were written in', () => {
    // A reader who wrote a broad allow and a narrow deny meant the deny.
    const rules = [allow('bash', 'git'), deny('bash', 'git push')]
    expect(ruleVerdict(rules, 'bash', { command: 'git push origin main' }, cwd)).toBe('deny')
    expect(ruleVerdict([...rules].reverse(), 'bash', { command: 'git push' }, cwd)).toBe('deny')
    expect(ruleVerdict(rules, 'bash', { command: 'git status' }, cwd)).toBe('allow')
  })
})

describe('what no rule can reach', () => {
  it('cannot allow a write to a protected path', () => {
    // A configuration file that could silently permit this is one worth
    // attacking. `full access` already exists for a reader who wants no
    // questions at all.
    expect(ruleVerdict([allow('write', '/repo/.env')], 'write', { path: '/repo/.env' }, cwd)).toBe(
      'nothing',
    )
    expect(ruleVerdict([allow('*', '/repo/.git')], 'edit', { path: '/repo/.git/config' }, cwd)).toBe(
      'nothing',
    )
  })

  it('cannot allow a write outside the workspace', () => {
    expect(ruleVerdict([allow('write', '/etc')], 'write', { path: '/etc/hosts' }, cwd)).toBe(
      'nothing',
    )
  })

  it('still denies a protected path, since a deny only ever asks more', () => {
    expect(ruleVerdict([deny('write', '/repo/.env')], 'write', { path: '/repo/.env' }, cwd)).toBe(
      'deny',
    )
  })
})

describe('a call with nothing to match', () => {
  it('is left to the level', () => {
    expect(ruleVerdict([allow('bash', 'x')], 'bash', {}, cwd)).toBe('nothing')
  })
})
