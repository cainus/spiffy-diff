import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { git } from './git'

export interface WorkspaceRequest {
  /** GitHub `owner/name`. */
  repo: string
  headSha: string
  cloneUrl: string
  /** The repo folder on this computer, or null to use a clone in `home`. */
  localRepo: string | null
  /** The spiffy data folder, for example `~/.spiffy`. */
  home: string
  /** Refs to fetch when the repo does not have the head, for example `pull/9/head`. */
  fetchRefs?: string[]
}

async function hasCommit(repo: string, sha: string): Promise<boolean> {
  try {
    await git(repo, 'cat-file', '-e', `${sha}^{commit}`)
    return true
  } catch {
    return false
  }
}

/**
 * Make a read-only checkout of the head for the agent. See CONTEXT.md "Workspace".
 * Returns the worktree folder. A second call for the same head returns the same folder.
 */
export async function ensureWorkspace(req: WorkspaceRequest): Promise<string> {
  const slug = req.repo.replace(/[^\w.-]/g, '__')
  let repo = req.localRepo
  if (!repo) {
    repo = join(req.home, 'repos', slug)
    if (!existsSync(repo)) {
      await mkdir(join(req.home, 'repos'), { recursive: true })
      await git(req.home, 'clone', '--quiet', '--filter=blob:none', '--no-checkout', req.cloneUrl, repo)
    }
  }

  const dir = join(req.home, 'worktrees', `${slug}-${req.headSha.slice(0, 12)}`)
  if (existsSync(dir)) return dir

  if (!(await hasCommit(repo, req.headSha))) {
    for (const ref of [...(req.fetchRefs ?? []), req.headSha]) {
      try {
        await git(repo, 'fetch', '--quiet', req.cloneUrl, ref)
      } catch {
        continue
      }
      if (await hasCommit(repo, req.headSha)) break
    }
  }

  await mkdir(join(req.home, 'worktrees'), { recursive: true })
  await git(repo, 'worktree', 'add', '--quiet', '--detach', dir, req.headSha)
  return dir
}
