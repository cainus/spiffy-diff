// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { BranchCandidate, PrCandidate } from '@shared/ipc'
import {
  ago,
  filterCandidates,
  loadFilters,
  saveFilters,
  type SourceFilters,
} from './source-filter'

const branch = (name: string, extra: Partial<BranchCandidate> = {}): BranchCandidate => ({
  kind: 'branch',
  name,
  current: false,
  author: 'ada',
  updatedAt: '2026-01-01T00:00:00Z',
  merged: false,
  mine: false,
  ...extra,
})
const pr = (number: number, title: string, extra: Partial<PrCandidate> = {}): PrCandidate => ({
  kind: 'pr',
  number,
  title,
  url: `https://github.com/o/r/pull/${number}`,
  branch: `b${number}`,
  author: 'bob',
  updatedAt: '2026-01-01T00:00:00Z',
  draft: false,
  mine: false,
  ...extra,
})

const none: SourceFilters = { kind: 'all', mine: false, hideMerged: false }
const names = (list: ReturnType<typeof filterCandidates>) =>
  list.map((c) => (c.kind === 'pr' ? `#${c.number}` : c.name))

describe('filterCandidates', () => {
  const all = [
    branch('main', { current: true, merged: true }),
    branch('fix/retry', { mine: true }),
    branch('old-work', { merged: true }),
    pr(7, 'Add retry to the client'),
    pr(8, 'Update docs', { mine: true }),
  ]

  it('keeps everything without filters', () => {
    expect(names(filterCandidates(all, none, ''))).toEqual([
      'main',
      'fix/retry',
      'old-work',
      '#7',
      '#8',
    ])
  })

  it('filters by kind', () => {
    expect(names(filterCandidates(all, { ...none, kind: 'pr' }, ''))).toEqual(['#7', '#8'])
    expect(names(filterCandidates(all, { ...none, kind: 'branch' }, ''))).toEqual([
      'main',
      'fix/retry',
      'old-work',
    ])
  })

  it('filters to the items of the user', () => {
    expect(names(filterCandidates(all, { ...none, mine: true }, ''))).toEqual(['fix/retry', '#8'])
  })

  it('hides merged branches but keeps the current branch', () => {
    expect(names(filterCandidates(all, { ...none, hideMerged: true }, ''))).toEqual([
      'main',
      'fix/retry',
      '#7',
      '#8',
    ])
  })

  it('matches every word of the query in the name, title, number, branch, or author', () => {
    expect(names(filterCandidates(all, none, 'retry'))).toEqual(['fix/retry', '#7'])
    expect(names(filterCandidates(all, none, 'retry client'))).toEqual(['#7'])
    expect(names(filterCandidates(all, none, '#8'))).toEqual(['#8'])
    expect(names(filterCandidates(all, none, 'BOB'))).toEqual(['#7', '#8'])
  })
})

describe('saved filters', () => {
  beforeEach(() => localStorage.clear())

  it('gives the defaults when nothing or bad data is saved', () => {
    expect(loadFilters()).toEqual(none)
    localStorage.setItem('spiffy.sourceFilters', 'oops')
    expect(loadFilters()).toEqual(none)
  })

  it('loads what it saved', () => {
    saveFilters({ kind: 'pr', mine: true, hideMerged: true })
    expect(loadFilters()).toEqual({ kind: 'pr', mine: true, hideMerged: true })
  })
})

describe('ago', () => {
  const now = Date.parse('2026-01-10T00:00:00Z')
  it('writes a relative date', () => {
    expect(ago('2026-01-07T00:00:00Z', now)).toBe('3 days ago')
    expect(ago('2026-01-09T23:59:50Z', now)).toBe('just now')
    expect(ago('nope', now)).toBe('')
  })
})
