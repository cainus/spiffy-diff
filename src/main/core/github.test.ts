import { describe, expect, it } from 'vitest'
import { findOpenPr, loadPrSource, type GhRunner } from './github'

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

    await expect(loadPrSource('https://example.com/x', gh)).rejects.toThrow(/not a GitHub pull request URL/)
    expect(gh.calls).toEqual([])
  })
})

describe('findOpenPr', () => {
  it('returns the open PR for the branch', async () => {
    const gh = fakeGh({
      'pr list': JSON.stringify([{ url: 'u', title: 't', body: 'b', baseRefName: 'main' }]),
    })

    expect(await findOpenPr('/repo', 'feature', gh)).toEqual({ url: 'u', title: 't', body: 'b', baseRefName: 'main' })
    expect(gh.calls[0]).toEqual(expect.arrayContaining(['--head', 'feature', '--state', 'open']))
  })

  it('returns null when there is no open PR', async () => {
    expect(await findOpenPr('/repo', 'feature', fakeGh({ 'pr list': '[]' }))).toBeNull()
  })

  it('returns null when gh fails, for example in a repo without a GitHub remote', async () => {
    expect(await findOpenPr('/repo', 'feature', fakeGh({}))).toBeNull()
  })
})
