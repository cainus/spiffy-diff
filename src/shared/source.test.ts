import { describe, expect, it } from 'vitest'
import { parsePrUrl, summaryCacheKey } from './source'

describe('parsePrUrl', () => {
  it.each([
    ['https://github.com/acme-co/widget-api/pull/3300', 'acme-co', 'widget-api', 3300],
    ['https://github.com/cainus/spiffy/pull/7/files', 'cainus', 'spiffy', 7],
    ['github.com/cainus/spiffy/pull/12?diff=split', 'cainus', 'spiffy', 12],
    ['  https://github.com/a/b/pull/1#discussion_r1  ', 'a', 'b', 1],
  ])('parses %s', (url, owner, repo, number) => {
    expect(parsePrUrl(url)).toEqual({ owner, repo, number })
  })

  it.each([
    'https://github.com/a/b',
    'https://gitlab.com/a/b/pull/1',
    'not a url',
    'https://github.com/a/b/pull/x',
  ])('returns null for %s', (url) => {
    expect(parsePrUrl(url)).toBeNull()
  })
})

describe('summaryCacheKey', () => {
  it('changes when the head, the base, the dirty-tree hash, or the backend changes', () => {
    const base = {
      repo: 'a/b',
      baseSha: '1',
      headSha: '2',
      dirtyHash: null,
      backend: 'claude',
    } as const
    const keys = new Set([
      summaryCacheKey(base),
      summaryCacheKey({ ...base, headSha: '3' }),
      summaryCacheKey({ ...base, baseSha: '0' }),
      summaryCacheKey({ ...base, dirtyHash: 'abc' }),
      summaryCacheKey({ ...base, backend: 'codex' }),
    ])

    expect(keys.size).toBe(5)
    expect(summaryCacheKey(base)).toBe(summaryCacheKey({ ...base }))
  })

  it('has a format version, so that summaries in an old format are made again', () => {
    expect(
      summaryCacheKey({
        repo: 'a/b',
        baseSha: '1',
        headSha: '2',
        dirtyHash: null,
        backend: 'claude',
      }),
    ).toMatch(/^v6-/)
  })

  it('is safe to use as a file name', () => {
    expect(
      summaryCacheKey({
        repo: 'acme-co/widget-api',
        baseSha: 'a',
        headSha: 'b',
        dirtyHash: null,
        backend: 'codex',
      }),
    ).toMatch(/^[\w.-]+$/)
  })
})
