/** Pins what forking relies on in pi's SessionManager.
 *
 *  `createBranchedSession` is SDK surface, not a contract this app controls —
 *  a pi upgrade can change it. These tests fail loudly if it stops doing what
 *  the fork depends on. The two load-bearing surprises, found by these tests:
 *
 *  - The call MUTATES the manager: the manager becomes the fork (new id, new
 *    file, entries replaced). The fork must therefore go through a second
 *    manager opened over the parent's file, never the live parent's own.
 *  - A fork whose path holds no assistant message is not written to disk
 *    until the first assistant reply — the same deferred-write contract a
 *    brand-new session has. */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionManager } from '@earendil-works/pi-coding-agent'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fork-pin-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function user(content: string): Parameters<SessionManager['appendMessage']>[0] {
  return { role: 'user', content, timestamp: 1 }
}

function assistant(text: string): Parameters<SessionManager['appendMessage']>[0] {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'test',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: 1,
  } as Parameters<SessionManager['appendMessage']>[0]
}

/** A parent with two exchanges, written to disk, plus the checkpoint id —
 *  which in this app is a user message's entry id. */
function seeded(dir: string): {
  parent: SessionManager
  parentFile: string
  first: string
  second: string
} {
  const parent = SessionManager.create(dir, dir)
  const first = parent.appendMessage(user('first question'))
  parent.appendMessage(assistant('first answer'))
  const second = parent.appendMessage(user('second question'))
  parent.appendMessage(assistant('second answer'))
  return { parent, parentFile: parent.getSessionFile()!, first, second }
}

describe('createBranchedSession, as the fork relies on it', () => {
  it('mutates the manager it is called on into the fork', () => {
    const dir = tempDir()
    const { parent, parentFile, second } = seeded(dir)
    const throwaway = SessionManager.open(parentFile)

    const path = throwaway.createBranchedSession(second)

    // The manager IS the fork now — which is why the live parent's own
    // manager must never make this call.
    expect(throwaway.getSessionId()).not.toBe(parent.getSessionId())
    expect(throwaway.getSessionFile()).toBe(path)
    expect(path).not.toBe(parentFile)
  })

  it('holds only the root-to-checkpoint path, ending at the checkpoint', () => {
    const dir = tempDir()
    const { parentFile, second } = seeded(dir)
    const fork = SessionManager.open(parentFile)

    fork.createBranchedSession(second)

    const entries = fork.buildContextEntries()
    expect(entries.length).toBe(3)
    expect(fork.getLeafEntry()?.type).toBe('message')
    // The checkpoint entry itself is the leaf — same content, new identity.
    const leaf = fork.getLeafEntry()
    expect(leaf && 'message' in leaf && leaf.message).toMatchObject({
      role: 'user',
      content: 'second question',
    })
  })

  it('leaves the parent file byte-identical and the live parent untouched', () => {
    const dir = tempDir()
    const { parent, parentFile, second } = seeded(dir)
    const before = readFileSync(parentFile, 'utf8')
    const leafBefore = parent.getLeafId()

    SessionManager.open(parentFile).createBranchedSession(second)

    expect(readFileSync(parentFile, 'utf8')).toBe(before)
    expect(parent.getLeafId()).toBe(leafBefore)
    expect(parent.buildContextEntries().length).toBe(4)
  })

  it('points the fork back at the parent and keeps its cwd', () => {
    const dir = tempDir()
    const { parentFile, second } = seeded(dir)
    const fork = SessionManager.open(parentFile)

    const path = fork.createBranchedSession(second)
    if (path === undefined) throw new Error('fork of a persisted session must return a path')

    expect(fork.getHeader()?.parentSession).toBe(parentFile)
    expect(fork.getCwd()).toBe(dir)
    // An assistant message is in the path, so the file exists at once, and
    // reopening it reads the same fork back.
    const reopened = SessionManager.open(path)
    expect(reopened.getSessionId()).toBe(fork.getSessionId())
    expect(reopened.buildContextEntries().length).toBe(3)
  })

  it('defers the file when the path holds no assistant message', () => {
    const dir = tempDir()
    const { parentFile, first } = seeded(dir)
    const fork = SessionManager.open(parentFile)

    const path = fork.createBranchedSession(first)!

    // Not on disk yet — written on the first assistant reply, like a brand-new
    // session. A fork abandoned before its first send leaves nothing behind.
    expect(existsSync(path)).toBe(false)
    expect(fork.buildContextEntries().length).toBe(1)
  })

  it('throws on an id the session does not have', () => {
    const dir = tempDir()
    const { parentFile } = seeded(dir)
    expect(() => SessionManager.open(parentFile).createBranchedSession('no-such')).toThrow()
  })
})
