import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { parseDiff } from '@shared/diff'
import type { BranchList } from '@shared/ipc'
import type { LoadedSource } from '@shared/source'

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

export async function loadBranchSource(
  cwd: string,
  branch: string,
  options: BranchOptions,
): Promise<LoadedSource> {
  const pr = await options.findPr(cwd, branch)
  const baseBranch = pr?.baseRefName ?? (await defaultBranch(cwd))
  const headSha = await gitLine(cwd, 'rev-parse', `${branch}^{commit}`)
  const baseSha = await gitLine(cwd, 'merge-base', headSha, `origin/${baseBranch}`)

  const current = await gitLine(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const withDirty = options.includeUncommitted && current === branch
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
    dirtyHash: dirty ? createHash('sha1').update(dirty).digest('hex').slice(0, 12) : null,
    files: parseDiff(diff),
  }
}

export async function listBranches(cwd: string): Promise<BranchList> {
  const current = await gitLine(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const all = (await gitLine(cwd, 'branch', '--format=%(refname:short)', '--sort=-committerdate'))
    .split('\n')
    .filter(Boolean)
  return { current, branches: [current, ...all.filter((b) => b !== current)] }
}
