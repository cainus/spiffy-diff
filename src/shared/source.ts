import type { DiffFile } from './diff'

export type Backend = 'claude' | 'codex'

export interface PrRef {
  owner: string
  repo: string
  number: number
}

const PR_URL =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/

export function parsePrUrl(input: string): PrRef | null {
  const m = PR_URL.exec(input.trim())
  if (!m) return null
  return { owner: m[1]!, repo: m[2]!, number: Number(m[3]) }
}

export interface CacheKeyParts {
  repo: string
  baseSha: string
  headSha: string
  dirtyHash: string | null
  backend: Backend
}

/** Change this when the summary format changes. Then spiffy makes old summaries again. */
const SUMMARY_VERSION = 'v5'

/** The cache key for one summary. A new push or a new dirty tree gives a new key. */
export function summaryCacheKey(p: CacheKeyParts): string {
  const repo = p.repo.replace(/[^\w.-]/g, '_')
  return [SUMMARY_VERSION, repo, p.baseSha, p.headSha, p.dirtyHash ?? 'clean', p.backend].join('-')
}

/** The version of a source: its head commit and the hash of its uncommitted changes. */
export interface SourceHead {
  headSha: string
  dirtyHash: string | null
}

/** A source after spiffy reads it. See CONTEXT.md. */
export interface LoadedSource {
  kind: 'pr' | 'branch'
  repo: string
  title: string
  body: string
  prUrl: string | null
  baseSha: string
  headSha: string
  dirtyHash: string | null
  files: DiffFile[]
}
