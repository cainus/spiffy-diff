import { describe, expect, it } from 'vitest'
import type { DiffFile, Hunk } from './diff'
import { buildSummary, hunkOwners, OTHER_GOAL_TITLE, NOISE_GOAL_TITLE } from './summary'

function hunk(id: string, path: string): Hunk {
  return {
    id,
    path,
    header: '@@ -1 +1 @@',
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 1,
    additions: 1,
    deletions: 1,
    patch: '@@ -1 +1 @@\n-a\n+b',
  }
}

function file(path: string, ...ids: string[]): DiffFile {
  return {
    path,
    oldPath: path,
    status: 'modified',
    binary: false,
    hunks: ids.map((id) => hunk(id, path)),
  }
}

const files = [
  file('src/a.ts', 'h1', 'h2'),
  file('src/b.ts', 'h3'),
  file('package-lock.json', 'h4'),
]

describe('buildSummary', () => {
  it('gives stable IDs to goals and changes and keeps the model text', () => {
    const summary = buildSummary(
      {
        overview: 'Adds retry.',
        goals: [
          {
            title: 'Add retry',
            description: 'Retry failed calls.',
            changes: [{ title: 'Wrap call', description: 'Loop.', hunkIds: ['h1', 'h2', 'h3'] }],
          },
        ],
      },
      files,
    )

    expect(summary.overview).toBe('Adds retry.')
    expect(summary.goals[0]).toMatchObject({
      id: 'g1',
      title: 'Add retry',
      kind: 'model',
      changes: [{ id: 'g1.c1', title: 'Wrap call', hunkIds: ['h1', 'h2', 'h3'] }],
    })
  })

  it('removes hunk IDs that do not exist and changes that have no hunks left', () => {
    const summary = buildSummary(
      {
        overview: '',
        goals: [
          {
            title: 'G',
            description: '',
            changes: [
              { title: 'real', description: '', hunkIds: ['h1', 'h99', 'h2', 'h3'] },
              { title: 'invented', description: '', hunkIds: ['h42'] },
            ],
          },
        ],
      },
      files,
    )

    expect(summary.goals[0]!.changes.map((c) => [c.title, c.hunkIds])).toEqual([
      ['real', ['h1', 'h2', 'h3']],
    ])
  })

  it('puts hunks with no change into an Other changes goal, one change per file', () => {
    const summary = buildSummary(
      {
        overview: '',
        goals: [
          {
            title: 'G',
            description: '',
            changes: [{ title: 'c', description: '', hunkIds: ['h2'] }],
          },
        ],
      },
      files,
    )

    const other = summary.goals.find((g) => g.kind === 'other')!
    expect(other.title).toBe(OTHER_GOAL_TITLE)
    expect(other.changes.map((c) => [c.title, c.hunkIds])).toEqual([
      ['src/a.ts', ['h1']],
      ['src/b.ts', ['h3']],
    ])
  })

  it('puts noise hunks into the Generated & lockfiles goal even when the model uses them', () => {
    const summary = buildSummary(
      {
        overview: '',
        goals: [
          {
            title: 'G',
            description: '',
            changes: [{ title: 'c', description: '', hunkIds: ['h1', 'h2', 'h3', 'h4'] }],
          },
        ],
      },
      files,
    )

    expect(summary.goals[0]!.changes[0]!.hunkIds).toEqual(['h1', 'h2', 'h3'])
    expect(summary.goals.at(-1)).toMatchObject({
      kind: 'noise',
      title: NOISE_GOAL_TITLE,
      changes: [{ title: 'package-lock.json', hunkIds: ['h4'] }],
    })
  })

  it('removes goals that have no changes left', () => {
    const summary = buildSummary(
      {
        overview: '',
        goals: [
          {
            title: 'empty',
            description: '',
            changes: [{ title: 'x', description: '', hunkIds: ['nope'] }],
          },
          {
            title: 'full',
            description: '',
            changes: [{ title: 'y', description: '', hunkIds: ['h1', 'h2', 'h3'] }],
          },
        ],
      },
      files,
    )

    expect(summary.goals.map((g) => [g.id, g.title])).toEqual([
      ['g1', 'full'],
      ['g2', NOISE_GOAL_TITLE],
    ])
  })
})

describe('hunkOwners', () => {
  it('lists every goal and change that owns each hunk', () => {
    const summary = buildSummary(
      {
        overview: '',
        goals: [
          {
            title: 'A',
            description: '',
            changes: [{ title: 'a', description: '', hunkIds: ['h1', 'h2'] }],
          },
          {
            title: 'B',
            description: '',
            changes: [{ title: 'b', description: '', hunkIds: ['h2', 'h3'] }],
          },
        ],
      },
      files,
    )

    expect(hunkOwners(summary).get('h2')).toEqual([
      { goalId: 'g1', changeId: 'g1.c1' },
      { goalId: 'g2', changeId: 'g2.c1' },
    ])
  })
})
