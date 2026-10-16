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
    headOf: async () => ({ headSha: source.headSha, dirtyHash: source.dirtyHash }),
    repoName: async (path) => (path === '/code/r' ? 'o/r' : 'other/repo'),
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

  it('uses a local copy that you select for a PR, and remembers it for the next PR', async () => {
    const d = deps()
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    await sessions.linkRepo(sessionId, '/code/r')
    await sessions.workspace(sessionId)
    const next = await new Sessions(d).load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    await new Sessions(d).workspace(next.sessionId).catch(() => {})

    expect(d.calls).toContain('workspace /code/r h pull/3/head')
  })

  it('refuses a local copy of a different repository', async () => {
    const sessions = new Sessions(deps())
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    await expect(sessions.linkRepo(sessionId, '/code/elsewhere')).rejects.toThrow(
      'The folder /code/elsewhere is a copy of other/repo, not o/r.',
    )
  })

  it('remembers explained phrases for the same source, across sessions', async () => {
    const d = deps()
    const first = new Sessions(d)
    const { sessionId } = await first.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    expect(await first.explanations(sessionId)).toEqual({})

    await first.rememberExplanation(sessionId, 'PA queue', 'The queue of manual tasks.')
    await first.rememberExplanation(sessionId, 'pa  QUEUE', 'A newer answer.')
    const second = new Sessions(d)
    const again = await second.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    expect(await second.explanations(again.sessionId)).toEqual({
      'pa queue': { phrase: 'pa  QUEUE', text: 'A newer answer.' },
    })
  })

  it('shares explanations with later PRs and branches of the same repository', async () => {
    const d = deps()
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    await sessions.rememberExplanation(sessionId, 'PA', 'A privacy advisor.')

    const later = new Sessions({
      ...d,
      loadPr: async () => ({ ...source, headSha: 'h2', prUrl: 'https://github.com/o/r/pull/9' }),
    })
    const next = await later.load({ kind: 'pr', url: 'https://github.com/o/r/pull/9' })

    expect(await later.explanations(next.sessionId)).toEqual({
      pa: { phrase: 'PA', text: 'A privacy advisor.' },
    })
  })

  it('keeps explanations apart for a different repository', async () => {
    const d = deps()
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    await sessions.rememberExplanation(sessionId, 'PA', 'x')

    const other = new Sessions({ ...d, loadPr: async () => ({ ...source, repo: 'o/other' }) })
    const next = await other.load({ kind: 'pr', url: 'https://github.com/o/other/pull/1' })

    expect(await other.explanations(next.sessionId)).toEqual({})
  })

  it('tells when the source has a new head commit or new uncommitted changes', async () => {
    let head = { headSha: source.headSha, dirtyHash: source.dirtyHash }
    const d = deps({ headOf: async () => head })
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    expect(await sessions.hasNewVersion(sessionId)).toBe(false)
    head = { headSha: 'h2', dirtyHash: source.dirtyHash }
    expect(await sessions.hasNewVersion(sessionId)).toBe(true)
    head = { headSha: source.headSha, dirtyHash: 'd2' }
    expect(await sessions.hasNewVersion(sessionId)).toBe(true)
  })

  it('asks for the head of the same request that loaded the source', async () => {
    const asked: unknown[] = []
    const sessions = new Sessions(
      deps({
        headOf: async (req) => {
          asked.push(req)
          return { headSha: source.headSha, dirtyHash: null }
        },
      }),
    )
    const request = {
      kind: 'branch',
      repoPath: '/code/r',
      branch: 'feature',
      includeUncommitted: true,
    } as const
    const { sessionId } = await sessions.load(request)

    await sessions.hasNewVersion(sessionId)

    expect(asked).toEqual([request])
  })

  it('does not report a new version when the check fails, for example offline', async () => {
    const sessions = new Sessions(
      deps({ headOf: async () => Promise.reject(new Error('offline')) }),
    )
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    expect(await sessions.hasNewVersion(sessionId)).toBe(false)
  })

  it('saves a change that the agent wrote again, in the session and in the cache', async () => {
    const withChange: Summary = {
      overview: 'o',
      goals: [
        {
          id: 'g1',
          kind: 'model',
          title: 'G',
          description: '',
          changes: [{ id: 'g1.c1', title: 'Old', description: 'old', hunkIds: ['h1'] }],
        },
      ],
      hunkNotes: { h1: 'old note' },
    }
    const d = deps({ summarize: async () => withChange })
    const sessions = new Sessions(d)
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    await sessions.summarize(sessionId, 'claude', () => {})

    const saved = await sessions.saveRerun(sessionId, 'claude', 'g1', 'g1.c1', {
      type: 'done',
      title: 'New',
      description: 'new',
      hunkNotes: { h1: 'new note' },
      blockNotes: {},
    })

    expect(saved.goals[0]!.changes[0]!.title).toBe('New')
    expect(sessions.get(sessionId).summary).toEqual(saved)
    const later = new Sessions({
      ...d,
      summarize: async () => Promise.reject(new Error('not cached')),
    })
    const again = await later.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })
    expect(await later.summarize(again.sessionId, 'claude', () => {})).toEqual(saved)
  })

  it('refuses to save a rerun before the summary exists', async () => {
    const sessions = new Sessions(deps())
    const { sessionId } = await sessions.load({ kind: 'pr', url: 'https://github.com/o/r/pull/3' })

    await expect(
      sessions.saveRerun(sessionId, 'claude', 'g1', 'g1.c1', {
        type: 'done',
        title: 't',
        description: 'd',
        hunkNotes: {},
        blockNotes: {},
      }),
    ).rejects.toThrow('summary')
  })

  it('rejects an unknown session ID', async () => {
    await expect(new Sessions(deps()).workspace('nope')).rejects.toThrow(/unknown session/i)
  })
})
