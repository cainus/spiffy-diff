import { describe, expect, it } from 'vitest'
import { progressFraction, progressLabel } from './progress'

describe('progressFraction', () => {
  it('moves through the first 70% with each step of the agent, and never fills it before the next phase', () => {
    const at = (done: number) =>
      progressFraction({ plan: 'single', phase: 'reading', done, total: 0 })
    expect(at(0)).toBe(0)
    expect(at(6)).toBeCloseTo(0.35)
    expect(at(1)).toBeGreaterThan(at(0))
    expect(at(50)).toBeGreaterThan(at(20))
    expect(at(1000)).toBeLessThan(0.7)
  })

  it('fills 70-85% while hunks get their changes, then 85-100% while hunks get their notes', () => {
    expect(
      progressFraction({ plan: 'single', phase: 'summarizing', done: 5, total: 10 }),
    ).toBeCloseTo(0.775)
    expect(
      progressFraction({ plan: 'single', phase: 'summarizing', done: 10, total: 10 }),
    ).toBeCloseTo(0.85)
    expect(progressFraction({ plan: 'single', phase: 'noting', done: 5, total: 10 })).toBeCloseTo(
      0.925,
    )
    expect(progressFraction({ plan: 'single', phase: 'noting', done: 10, total: 10 })).toBe(1)
  })

  it('gives the file pass of a map-reduce summary the first 30%', () => {
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'digesting', done: 1, total: 2 }),
    ).toBeCloseTo(0.15)
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'reading', done: 0, total: 0 }),
    ).toBeCloseTo(0.3)
    expect(
      progressFraction({ plan: 'map-reduce', phase: 'reading', done: 6, total: 0 }),
    ).toBeCloseTo(0.5)
  })

  it('treats a counted phase with nothing to do as complete', () => {
    expect(progressFraction({ plan: 'single', phase: 'noting', done: 0, total: 0 })).toBe(1)
  })
})

describe('progressLabel', () => {
  it('counts the steps of the agent and tells the last step', () => {
    expect(
      progressLabel({
        plan: 'single',
        phase: 'reading',
        done: 2,
        total: 0,
        activity: 'Reading src/a.ts',
      }),
    ).toBe('The agent reads the code: 2 steps · Reading src/a.ts')
    expect(
      progressLabel({
        plan: 'single',
        phase: 'reading',
        done: 1,
        total: 0,
        activity: 'Searching for x',
      }),
    ).toBe('The agent reads the code: 1 step · Searching for x')
  })

  it('counts the hunk notes', () => {
    expect(progressLabel({ plan: 'single', phase: 'noting', done: 3, total: 12 })).toBe(
      'The agent writes the hunk notes: 3 of 12 hunks',
    )
  })

  it('tells that the agent starts before its first step', () => {
    expect(progressLabel({ plan: 'single', phase: 'reading', done: 0, total: 0 })).toBe(
      'The agent starts to read the code',
    )
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
