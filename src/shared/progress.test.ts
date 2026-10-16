import { describe, expect, it } from 'vitest'
import { progressFraction, progressLabel } from './progress'

describe('progressFraction', () => {
  it('fills the first 70% while the agent reads the files of a single-pass summary', () => {
    expect(progressFraction({ plan: 'single', phase: 'reading', done: 0, total: 4 })).toBe(0)
    expect(progressFraction({ plan: 'single', phase: 'reading', done: 2, total: 4 })).toBeCloseTo(
      0.35,
    )
    expect(progressFraction({ plan: 'single', phase: 'reading', done: 4, total: 4 })).toBeCloseTo(
      0.7,
    )
  })

  it('fills the last 30% while hunks get their changes', () => {
    expect(
      progressFraction({ plan: 'single', phase: 'summarizing', done: 5, total: 10 }),
    ).toBeCloseTo(0.85)
    expect(progressFraction({ plan: 'single', phase: 'summarizing', done: 10, total: 10 })).toBe(1)
  })

  it('gives the file pass of a map-reduce summary the first 30%', () => {
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'digesting', done: 1, total: 2 }),
    ).toBeCloseTo(0.15)
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'reading', done: 0, total: 3 }),
    ).toBeCloseTo(0.3)
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'reading', done: 3, total: 3 }),
    ).toBeCloseTo(0.7)
  })

  it('treats a phase with nothing to do as complete', () => {
    expect(progressFraction({ plan: 'single', phase: 'reading', done: 0, total: 0 })).toBeCloseTo(
      0.7,
    )
  })
})

describe('progressLabel', () => {
  it('names the file that the agent reads', () => {
    expect(
      progressLabel({ plan: 'single', phase: 'reading', done: 2, total: 5, file: 'src/a.ts' }),
    ).toBe('The agent reads the code: 2 of 5 files (src/a.ts)')
  })

  it('counts the hunks that have a change', () => {
    expect(progressLabel({ plan: 'single', phase: 'summarizing', done: 4, total: 12 })).toBe(
      'The agent groups the hunks: 4 of 12 hunks',
    )
  })

  it('counts the files of the file pass', () => {
    expect(progressLabel({ plan: 'map-reduce', phase: 'digesting', done: 1, total: 9 })).toBe(
      'The agent summarizes each file: 1 of 9 files',
    )
  })
})
