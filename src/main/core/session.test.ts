import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { Sessions, type SessionDeps } from './session'

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 't',
  body: '',
  prUrl: 'https://github.com/o/r/pull/3',
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: [],
}

const summary: Summary = { overview: 'o', goals: [] }

function deps(overrides: Partial<SessionDeps> = {}): SessionDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    home: mkdtempSync(join(tmpdir(), 'spiffy-session-')),
    loadPr: async (url) => {
      calls.push(`loadPr ${url}`)
      return source
    },
    loadBranch: async (repoPath, branch) => {
      calls.push(`loadBranch ${repoPath} ${branch}`)
      return { ...source, kind: 'branch', prUrl: null, repo: 'o/r' }
    },
    ensureWorkspace: async (req) => {
      calls.push(
        `workspace ${req.localRepo ?? 'clone'} ${req.headSha} ${(req.fetchRefs ?? []).join(',')}`,
      )
      return '/ws'
    },
    summarize: async (_source, cwd) => {
      calls.push(`summarize ${cwd}`)
      return summary
    },
    ...overrides,
  }
}

describe('Sessions', () => {
  it('loads a PR source and gives it a session ID', async () => {
    const d = deps()
    const sessions = new Sessions(d)

    const { sessionId, source: loaded } = await sessions.load({
      kind: 'pr',
      url: 'https://github.com/o/r/pull/3',
    })

    expect(sessionId).toMatch(/\w+/)
    expect(loaded.title).toBe('t')
  })

  it('summarizes in the workspace and uses the cache on the next request', async () => {
    const d = deps()
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    await sessions.summarize(sessionId, 'claude', () => {})
    const fresh = new Sessions(d)
    const again = await fresh.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    await fresh.summarize(again.sessionId, 'claude', () => {})

    expect(d.calls.filter((c) => c.startsWith('summarize'))).toEqual(['summarize /ws'])
    expect(d.calls).toContain('workspace clone h pull/3/head')
  })

  it('uses the local repo that a branch source showed for later PRs of the same repo', async () => {
    const d = deps()
    const sessions = new Sessions(d)
    await sessions.load({
      kind: 'branch',
      repoPath: '/code/r',
      branch: 'feature',
      includeUncommitted: false,
    })
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    await sessions.workspace(sessionId)

    expect(d.calls).toContain('workspace /code/r h pull/3/head')
  })

  it('uses the repo folder itself as the workspace when the branch source includes uncommitted changes', async () => {
    const d = deps({
      loadBranch: async () => ({ ...source, kind: 'branch', prUrl: null, dirtyHash: 'abc' }),
    })
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({
      kind: 'branch',
      repoPath: '/code/r',
      branch: 'feature',
      includeUncommitted: true,
    })

    expect(await sessions.workspace(sessionId)).toBe('/code/r')
  })

  it('rejects an unknown session ID', async () => {
    await expect(new Sessions(deps()).workspace('nope')).rejects.toThrow(/unknown session/i)
  })
})
