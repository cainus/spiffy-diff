import { describe, expect, it } from 'vitest'
import type { LoadedSource } from '@shared/source'
import { sourceName } from './source-name'

const pr: LoadedSource = {
  kind: 'pr',
  repo: 'acme/shop',
  title: 'Add retry',
  body: '',
  prUrl: 'https://github.com/acme/shop/pull/42',
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: [],
}

describe('sourceName', () => {
  it('names a PR by its number and repository', () => {
    expect(sourceName(pr, { kind: 'pr', url: pr.prUrl! })).toEqual({
      kind: 'PR #42',
      title: 'Add retry',
      where: 'acme/shop',
    })
  })

  it('names a branch with an open PR by the branch and the PR number', () => {
    const source = { ...pr, kind: 'branch' as const, repo: 'shop' }
    const request = {
      kind: 'branch' as const,
      repoPath: '/code/shop',
      branch: 'retry-calls',
      includeUncommitted: false,
    }
    expect(sourceName(source, request)).toEqual({
      kind: 'Branch retry-calls · PR #42',
      title: 'Add retry',
      where: 'shop',
    })
  })

  it('names a branch without a PR by the branch, and tells about uncommitted changes', () => {
    const source = {
      ...pr,
      kind: 'branch' as const,
      repo: 'shop',
      title: 'retry-calls',
      prUrl: null,
      dirtyHash: 'd1',
    }
    const request = {
      kind: 'branch' as const,
      repoPath: '/code/shop',
      branch: 'retry-calls',
      includeUncommitted: true,
    }
    expect(sourceName(source, request)).toEqual({
      kind: 'Branch',
      title: 'retry-calls',
      where: 'shop · with uncommitted changes',
    })
  })
})
