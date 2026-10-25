import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { parseDiff } from '@shared/diff'
import type { BranchCandidate } from '@shared/ipc'
import type { LoadedSource, SourceHead } from '@shared/source'

const exec = promisify(execFile)

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 })
  return stdout
}

async function gitLine(cwd: string, ...args: string[]): Promise<string> {
  return (await git(cwd, ...args)).trim()
}

export interface OpenPr {
  url: string
  title: string
  body: string
  baseRefName: string
}

/** Find the open PR for a branch. Returns null when there is none. */
export type PrLookup = (cwd: string, branch: string) => Promise<OpenPr | null>

export async function defaultBranch(cwd: string): Promise<string> {
  try {
    const ref = await gitLine(cwd, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')
    return ref.replace(/^origin\//, '')
  } catch {
    const remote = await gitLine(cwd, 'branch', '-r', '--format=%(refname:short)')
    return remote.split('\n').includes('origin/main') ? 'main' : 'master'
  }
}

/** The GitHub `owner/name` of the repo, or the folder name when there is no GitHub remote. */
export async function repoName(cwd: string): Promise<string> {
  try {
    const url = await gitLine(cwd, 'remote', 'get-url', 'origin')
    const m = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url)
    if (m) return m[1]!
  } catch {
    // No origin remote.
  }
  return basename(cwd)
}

export interface BranchOptions {
  includeUncommitted: boolean
  findPr: PrLookup
}

/** Uncommitted changes count only when the branch is checked out. */
async function usesUncommitted(cwd: string, branch: string, include: boolean): Promise<boolean> {
  return include && (await gitLine(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')) === branch
}

function dirtyHash(dirty: string): string | null {
  return dirty ? createHash('sha1').update(dirty).digest('hex').slice(0, 12) : null
}

/** The head commit and the uncommitted hash of a branch, without the diff. */
export async function branchHead(
  cwd: string,
  branch: string,
  includeUncommitted: boolean,
): Promise<SourceHead> {
  const headSha = await gitLine(cwd, 'rev-parse', `${branch}^{commit}`)
  const withDirty = await usesUncommitted(cwd, branch, includeUncommitted)
  return { headSha, dirtyHash: dirtyHash(withDirty ? await git(cwd, 'diff', 'HEAD') : '') }
}

export async function loadBranchSource(
  cwd: string,
  branch: string,
  options: BranchOptions,
): Promise<LoadedSource> {
  const pr = await options.findPr(cwd, branch)
  const baseBranch = pr?.baseRefName ?? (await defaultBranch(cwd))
  const headSha = await gitLine(cwd, 'rev-parse', `${branch}^{commit}`)
  const baseSha = await gitLine(cwd, 'merge-base', headSha, `origin/${baseBranch}`)

  const withDirty = await usesUncommitted(cwd, branch, options.includeUncommitted)
  const dirty = withDirty ? await git(cwd, 'diff', 'HEAD') : ''
  const diff = await git(cwd, 'diff', '--find-renames', baseSha, ...(withDirty ? [] : [headSha]))

  return {
    kind: 'branch',
    repo: await repoName(cwd),
    title: pr?.title ?? branch,
    body: pr?.body ?? '',
    prUrl: pr?.url ?? null,
    baseSha,
    headSha,
    dirtyHash: dirtyHash(dirty),
    files: parseDiff(diff),
  }
}

const FIELD = '\u001f'

/** The local branches, newest commit first, with the current branch marked. */
export async function listBranches(
  cwd: string,
): Promise<{ current: string; branches: BranchCandidate[] }> {
  const current = await gitLine(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const rows = await gitLine(
    cwd,
    'for-each-ref',
    '--sort=-committerdate',
    `--format=%(refname:short)${FIELD}%(authorname)${FIELD}%(committerdate:iso-strict)`,
    'refs/heads',
  )
  const me = await gitLine(cwd, 'config', 'user.name').catch(() => '')
  const merged = await mergedBranches(cwd)
  const branches = rows
    .split('\n')
    .filter(Boolean)
    .map((row): BranchCandidate => {
      const [name, author, updatedAt] = row.split(FIELD) as [string, string, string]
      return {
        kind: 'branch',
        name,
        current: name === current,
        author,
        updatedAt,
        merged: merged.has(name),
        mine: me !== '' && author === me,
      }
    })
  return { current, branches }
}

/** The local branches that the default branch of `origin` already contains. */
async function mergedBranches(cwd: string): Promise<Set<string>> {
  try {
    const base = `origin/${await defaultBranch(cwd)}`
    const out = await gitLine(cwd, 'branch', '--merged', base, '--format=%(refname:short)')
    return new Set(out.split('\n').filter(Boolean))
  } catch {
    return new Set()
  }
}
