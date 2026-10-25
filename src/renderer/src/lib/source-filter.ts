import type { SourceCandidate } from '@shared/ipc'

export type KindFilter = 'all' | 'branch' | 'pr'

export interface SourceFilters {
  kind: KindFilter
  /** Only the branches and pull requests of the user. */
  mine: boolean
  /** Hide the branches that the default branch already contains. */
  hideMerged: boolean
}

export const PAGE_SIZE = 25

const KEY = 'spiffy.sourceFilters'
const DEFAULTS: SourceFilters = { kind: 'all', mine: false, hideMerged: false }

/** The saved filters. Query text is not saved. */
export function loadFilters(): SourceFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SourceFilters>
    return {
      kind: saved.kind === 'branch' || saved.kind === 'pr' ? saved.kind : DEFAULTS.kind,
      mine: saved.mine === true,
      hideMerged: saved.hideMerged === true,
    }
  } catch {
    return DEFAULTS
  }
}

export function saveFilters(filters: SourceFilters): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(filters))
  } catch {
    // The filters are a convenience.
  }
}

export function candidateKey(c: SourceCandidate): string {
  return c.kind === 'pr' ? `pr:${c.url}` : `branch:${c.name}`
}

function haystack(c: SourceCandidate): string {
  return (
    c.kind === 'pr' ? `#${c.number} ${c.title} ${c.branch} ${c.author}` : `${c.name} ${c.author}`
  ).toLowerCase()
}

/** The candidates that pass the filters and match every word of the query. */
export function filterCandidates(
  all: SourceCandidate[],
  filters: SourceFilters,
  query: string,
): SourceCandidate[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return all.filter((c) => {
    if (filters.kind !== 'all' && c.kind !== filters.kind) return false
    if (filters.mine && !c.mine) return false
    // The current branch stays, because it can have uncommitted changes.
    if (filters.hideMerged && c.kind === 'branch' && c.merged && !c.current) return false
    const text = haystack(c)
    return words.every((w) => text.includes(w))
  })
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 days ago" for an ISO date. */
export function ago(iso: string, now = Date.now()): string {
  const seconds = (Date.parse(iso) - now) / 1000
  if (Number.isNaN(seconds)) return ''
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
