import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { branchHead, defaultBranch, listBranches, loadBranchSource, type PrLookup } from './git'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim()
}

function commit(cwd: string, file: string, text: string): string {
  writeFileSync(join(cwd, file), text)
  git(cwd, 'add', file)
  git(cwd, 'commit', '-qm', `edit ${file}`)
  return git(cwd, 'rev-parse', 'HEAD')
}

const noPr: PrLookup = async () => null

let repo: string
let forkPoint: string

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'spiffy-git-'))
  const origin = join(root, 'origin.git')
  git(root, 'init', '-q', '--bare', '-b', 'trunk', origin)
  repo = join(root, 'work')
  git(root, 'clone', '-q', origin, repo)
  git(repo, 'checkout', '-q', '-b', 'trunk')
  forkPoint = commit(repo, 'a.txt', 'one\ntwo\nthree\n')
  git(repo, 'push', '-q', '-u', 'origin', 'trunk')
  git(repo, 'remote', 'set-head', 'origin', 'trunk')
  git(repo, 'checkout', '-q', '-b', 'feature')
  commit(repo, 'a.txt', 'one\nTWO\nthree\n')
  git(repo, 'checkout', '-q', 'trunk')
  commit(repo, 'b.txt', 'unrelated\n')
  git(repo, 'push', '-q')
  git(repo, 'checkout', '-q', 'feature')
})

describe('defaultBranch', () => {
  it('reads the default branch from origin/HEAD', async () => {
    expect(await defaultBranch(repo)).toBe('trunk')
  })
})

describe('loadBranchSource', () => {
  it('diffs the branch against its merge-base with the default branch', async () => {
    const source = await loadBranchSource(repo, 'feature', {
      includeUncommitted: false,
      findPr: noPr,
    })

    expect(source.baseSha).toBe(forkPoint)
    expect(source.headSha).toBe(git(repo, 'rev-parse', 'feature'))
    expect(source.dirtyHash).toBeNull()
    expect(source.files.map((f) => f.path)).toEqual(['a.txt'])
    expect(source.title).toBe('feature')
  })

  it('adds uncommitted changes and a dirty-tree hash when you ask for them', async () => {
    writeFileSync(join(repo, 'c.txt'), 'new\n')
    git(repo, 'add', 'c.txt')
    writeFileSync(join(repo, 'a.txt'), 'one\nTWO\nTHREE\n')

    const source = await loadBranchSource(repo, 'feature', {
      includeUncommitted: true,
      findPr: noPr,
    })

    expect(source.files.map((f) => f.path).sort()).toEqual(['a.txt', 'c.txt'])
    expect(source.dirtyHash).toMatch(/^[0-9a-f]{12}$/)
  })

  it('ignores uncommitted changes when you do not ask for them', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed\n')

    const source = await loadBranchSource(repo, 'feature', {
      includeUncommitted: false,
      findPr: noPr,
    })

    expect(source.files[0]!.hunks[0]!.patch).toContain('+TWO')
    expect(source.files[0]!.hunks[0]!.patch).not.toContain('changed')
  })

  it('uses the base branch and the text of an open PR for the branch', async () => {
    const releasePoint = git(repo, 'rev-parse', 'feature')
    git(repo, 'push', '-q', 'origin', 'feature:release')
    git(repo, 'fetch', '-q')
    commit(repo, 'a.txt', 'ONE\nTWO\nthree\n')
    const findPr: PrLookup = async (_cwd, branch) =>
      branch === 'feature'
        ? {
            url: 'https://github.com/o/r/pull/5',
            title: 'Uppercase two',
            body: 'Because.',
            baseRefName: 'release',
          }
        : null

    const source = await loadBranchSource(repo, 'feature', { includeUncommitted: false, findPr })

    expect(source).toMatchObject({
      title: 'Uppercase two',
      body: 'Because.',
      prUrl: 'https://github.com/o/r/pull/5',
      baseSha: releasePoint,
    })
  })
})

describe('listBranches', () => {
  it('lists local branches with the current branch first', async () => {
    const { current, branches } = await listBranches(repo)

    expect(current).toBe('feature')
    // The commits can share a second, so the order is not fixed.
    expect(branches.map((b) => [b.name, b.current]).sort()).toEqual([
      ['feature', true],
      ['trunk', false],
    ])
  })

  it('marks the branches that the default branch of origin contains', async () => {
    const { branches } = await listBranches(repo)

    expect(branches.map((b) => [b.name, b.merged]).sort()).toEqual([
      ['feature', false],
      ['trunk', true],
    ])
  })

  it('marks the branches of the git user, and gives the author and the date', async () => {
    git(repo, 'config', 'user.name', 'Ada')
    commit(repo, 'c.txt', 'x\n')

    const feature = (await listBranches(repo)).branches.find((b) => b.name === 'feature')!

    expect(feature.mine).toBe(false)
    expect(feature.author).toBe('t')
    expect(Date.parse(feature.updatedAt)).not.toBeNaN()
  })
})

describe('branchHead', () => {
  it('matches the head and the uncommitted hash of a loaded branch, and changes after a commit or an edit', async () => {
    writeFileSync(join(repo, 'a.txt'), 'dirty\n')
    const loaded = await loadBranchSource(repo, 'feature', {
      includeUncommitted: true,
      findPr: noPr,
    })

    expect(await branchHead(repo, 'feature', true)).toEqual({
      headSha: loaded.headSha,
      dirtyHash: loaded.dirtyHash,
    })

    writeFileSync(join(repo, 'a.txt'), 'dirtier\n')
    expect((await branchHead(repo, 'feature', true)).dirtyHash).not.toBe(loaded.dirtyHash)

    const next = commit(repo, 'c.txt', 'new\n')
    expect(await branchHead(repo, 'feature', false)).toEqual({ headSha: next, dirtyHash: null })
  })
})
