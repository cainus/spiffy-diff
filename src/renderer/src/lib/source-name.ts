import type { LoadRequest } from '@shared/ipc'
import { parsePrUrl, type LoadedSource } from '@shared/source'

export interface SourceName {
  /** What the source is: the PR number, or the branch. */
  kind: string
  title: string
  /** The repository, and if the diff has uncommitted changes. */
  where: string
}

/** The name of the open source, at the top of the window. Then you remember what you look at. */
export function sourceName(source: LoadedSource, request: LoadRequest | null): SourceName {
  const pr = source.prUrl ? parsePrUrl(source.prUrl) : null
  const number = pr ? `PR #${pr.number}` : ''
  const dirty = source.dirtyHash ? ' · with uncommitted changes' : ''
  if (source.kind === 'pr' || request?.kind !== 'branch') {
    return { kind: number || 'PR', title: source.title, where: source.repo + dirty }
  }
  // Without a PR, the title is the branch name. Do not show it two times.
  const kind = pr ? `Branch ${request.branch} · ${number}` : 'Branch'
  return { kind, title: source.title, where: source.repo + dirty }
}
