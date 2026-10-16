import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseDiff } from '@shared/diff'
import { parsePrUrl, type LoadedSource, type SourceHead } from '@shared/source'
import type { OpenPr } from './git'

const exec = promisify(execFile)

/** Run `gh` with arguments and return stdout. */
export type GhRunner = (args: string[], cwd?: string) => Promise<string>

export const runGh: GhRunner = async (args, cwd) => {
  const { stdout } = await exec('gh', args, { cwd, maxBuffer: 256 * 1024 * 1024 })
  return stdout
}

interface PrView {
  title: string
  body: string
  url: string
  baseRefOid: string
  headRefOid: string
}

function prTarget(url: string): string {
  const ref = parsePrUrl(url)
  if (!ref) throw new Error(`"${url}" is not a GitHub pull request URL.`)
  return `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`
}

/** The head commit of a PR, without the diff. It tells if the PR has new commits. */
export async function prHead(url: string, gh: GhRunner): Promise<SourceHead> {
  const view = JSON.parse(await gh(['pr', 'view', prTarget(url), '--json', 'headRefOid'])) as {
    headRefOid: string
  }
  return { headSha: view.headRefOid, dirtyHash: null }
}

export async function loadPrSource(url: string, gh: GhRunner): Promise<LoadedSource> {
  const ref = parsePrUrl(url)!
  const target = prTarget(url)

  const [view, diff] = await Promise.all([
    gh(['pr', 'view', target, '--json', 'title,body,url,baseRefOid,headRefOid']),
    gh(['pr', 'diff', target]),
  ])
  const pr = JSON.parse(view) as PrView

  return {
    kind: 'pr',
    repo: `${ref.owner}/${ref.repo}`,
    title: pr.title,
    body: pr.body,
    prUrl: pr.url,
    baseSha: pr.baseRefOid,
    headSha: pr.headRefOid,
    dirtyHash: null,
    files: parseDiff(diff),
  }
}

export async function findOpenPr(
  cwd: string,
  branch: string,
  gh: GhRunner,
): Promise<OpenPr | null> {
  try {
    const out = await gh(
      [
        'pr',
        'list',
        '--head',
        branch,
        '--state',
        'open',
        '--limit',
        '1',
        '--json',
        'url,title,body,baseRefName',
      ],
      cwd,
    )
    return (JSON.parse(out) as OpenPr[])[0] ?? null
  } catch {
    return null
  }
}
