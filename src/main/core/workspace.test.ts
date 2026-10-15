import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { ensureWorkspace } from './workspace'

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

let root: string
let origin: string
let home: string
let headSha: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spiffy-ws-'))
  home = join(root, 'home')
  origin = join(root, 'origin')
  git(root, 'init', '-q', '-b', 'main', origin)
  writeFileSync(join(origin, 'a.txt'), 'hello\n')
  git(origin, 'add', 'a.txt')
  git(origin, 'commit', '-qm', 'one')
  git(origin, 'checkout', '-q', '-b', 'pr')
  writeFileSync(join(origin, 'a.txt'), 'hello pr\n')
  git(origin, 'commit', '-qam', 'two')
  headSha = git(origin, 'rev-parse', 'HEAD')
  git(origin, 'checkout', '-q', 'main')
})

describe('ensureWorkspace', () => {
  it('clones the repo when there is no local copy and checks out the head in a worktree', async () => {
    const dir = await ensureWorkspace({
      repo: 'o/r',
      headSha,
      cloneUrl: origin,
      localRepo: null,
      home,
    })

    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('hello pr\n')
    expect(existsSync(join(home, 'repos', 'o__r'))).toBe(true)
  })

  it('uses the local repo and fetches the head when the local repo does not have it', async () => {
    const local = join(root, 'local')
    git(root, 'clone', '-q', '--no-local', '--single-branch', '-b', 'main', origin, local)
    expect(() => git(local, 'cat-file', '-e', `${headSha}^{commit}`)).toThrow()

    const dir = await ensureWorkspace({
      repo: 'o/r',
      headSha,
      cloneUrl: origin,
      localRepo: local,
      home,
      fetchRefs: ['pr'],
    })

    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('hello pr\n')
    expect(git(local, 'worktree', 'list')).toContain(dir)
    expect(existsSync(join(home, 'repos'))).toBe(false)
  })

  it('reuses the worktree on the second call', async () => {
    const first = await ensureWorkspace({
      repo: 'o/r',
      headSha,
      cloneUrl: origin,
      localRepo: null,
      home,
    })
    const second = await ensureWorkspace({
      repo: 'o/r',
      headSha,
      cloneUrl: origin,
      localRepo: null,
      home,
    })

    expect(second).toBe(first)
  })
})
