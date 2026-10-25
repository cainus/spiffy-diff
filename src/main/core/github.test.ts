import { describe, expect, it } from 'vitest'
import { findOpenPr, listOpenPrs, loadPrSource, type GhRunner, prHead } from './github'

const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
`

function fakeGh(responses: Record<string, string>): GhRunner & { calls: string[][] } {
  const calls: string[][] = []
  const run = async (args: string[]): Promise<string> => {
    calls.push(args)
    const key = args.slice(0, 2).join(' ')
    const out = responses[key]
    if (out === undefined) throw new Error(`unexpected gh ${args.join(' ')}`)
    return out
  }
  return Object.assign(run, { calls })
}

describe('loadPrSource', () => {
  it('reads PR metadata and the diff with gh', async () => {
    const gh = fakeGh({
      'pr view': JSON.stringify({
        title: 'Add retry',
        body: 'Fixes flakes.',
        url: 'https://github.com/o/r/pull/9',
        baseRefOid: 'base123',
        headRefOid: 'head456',
      }),
      'pr diff': diff,
    })

    const source = await loadPrSource('https://github.com/o/r/pull/9', gh)

    expect(source).toMatchObject({
      kind: 'pr',
      repo: 'o/r',
      title: 'Add retry',
      body: 'Fixes flakes.',
      prUrl: 'https://github.com/o/r/pull/9',
      baseSha: 'base123',
      headSha: 'head456',
      dirtyHash: null,
    })
    expect(source.files[0]!.hunks.map((h) => h.id)).toEqual(['h1'])
  })

  it('rejects input that is not a GitHub PR URL before it calls gh', async () => {
    const gh = fakeGh({})

    await expect(loadPrSource('https://example.com/x', gh)).rejects.toThrow(
      /not a GitHub pull request URL/,
    )
    expect(gh.calls).toEqual([])
  })
})

describe('prHead', () => {
  it('reads only the head commit of the PR', async () => {
    const calls: string[][] = []
    const gh: GhRunner = async (args) => {
      calls.push(args)
      return JSON.stringify({ headRefOid: 'h9' })
    }

    expect(await prHead('github.com/o/r/pull/3/files', gh)).toEqual({
      headSha: 'h9',
      dirtyHash: null,
    })
    expect(calls).toEqual([['pr', 'view', 'https://github.com/o/r/pull/3', '--json', 'headRefOid']])
  })
})

describe('findOpenPr', () => {
  it('returns the open PR for the branch', async () => {
    const gh = fakeGh({
      'pr list': JSON.stringify([{ url: 'u', title: 't', body: 'b', baseRefName: 'main' }]),
    })

    expect(await findOpenPr('/repo', 'feature', gh)).toEqual({
      url: 'u',
      title: 't',
      body: 'b',
      baseRefName: 'main',
    })
    expect(gh.calls[0]).toEqual(expect.arrayContaining(['--head', 'feature', '--state', 'open']))
  })

  it('returns null when there is no open PR', async () => {
    expect(await findOpenPr('/repo', 'feature', fakeGh({ 'pr list': '[]' }))).toBeNull()
  })

  it('returns null when gh fails, for example in a repo without a GitHub remote', async () => {
    expect(await findOpenPr('/repo', 'feature', fakeGh({}))).toBeNull()
  })
})

describe('listOpenPrs', () => {
  const pr = (number: number, login: string, updatedAt: string) => ({
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    headRefName: `b${number}`,
    author: { login },
    updatedAt,
    isDraft: false,
  })

  it('lists the open PRs with the newest update first, and marks the PRs of the GitHub user', async () => {
    const gh = fakeGh({
      'pr list': JSON.stringify([
        pr(1, 'ada', '2026-01-01T00:00:00Z'),
        pr(2, 'bob', '2026-02-01T00:00:00Z'),
      ]),
      'api user': 'ada\n',
    })

    const prs = await listOpenPrs('/repo', gh)

    expect(prs.map((p) => [p.number, p.mine, p.branch])).toEqual([
      [2, false, 'b2'],
      [1, true, 'b1'],
    ])
  })

  it('marks no PR as mine when the user is unknown', async () => {
    const gh = fakeGh({ 'pr list': JSON.stringify([pr(1, 'ada', '2026-01-01T00:00:00Z')]) })

    expect((await listOpenPrs('/repo', gh))[0]!.mine).toBe(false)
  })

  it('returns no PRs when gh fails', async () => {
    expect(await listOpenPrs('/repo', fakeGh({}))).toEqual([])
  })
})
