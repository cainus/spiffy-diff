import { describe, expect, it } from 'vitest'
import type { Summary } from '@shared/summary'
import { breadcrumbs, currentFocus, initialNav, navReducer, type NavState } from './nav'

const summary: Summary = {
  overview: '',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'Retry',
      description: '',
      changes: [{ id: 'g1.c1', title: 'Wrap', description: '', hunkIds: ['h1'] }],
    },
  ],
}

function run(...actions: Parameters<typeof navReducer>[1][]): NavState {
  return actions.reduce(navReducer, initialNav)
}

describe('navReducer', () => {
  it('drills in from the source to a goal and then to a change, moving forward', () => {
    const goal = run({ type: 'drillIn', goalId: 'g1' })
    const change = navReducer(goal, { type: 'drillIn', goalId: 'g1', changeId: 'g1.c1' })

    expect(goal).toMatchObject({ path: { level: 'goal', goalId: 'g1' }, direction: 1 })
    expect(change).toMatchObject({
      path: { level: 'change', goalId: 'g1', changeId: 'g1.c1' },
      direction: 1,
    })
  })

  it('drills out one level at a time, moving back, and stops at the source', () => {
    const change = run({ type: 'drillIn', goalId: 'g1', changeId: 'g1.c1' })

    const goal = navReducer(change, { type: 'drillOut' })
    const top = navReducer(goal, { type: 'drillOut' })
    const still = navReducer(top, { type: 'drillOut' })

    expect(goal).toMatchObject({ path: { level: 'goal', goalId: 'g1' }, direction: -1 })
    expect(top.path).toEqual({ level: 'source' })
    expect(still).toBe(top)
  })

  it('jumps to a breadcrumb', () => {
    const state = run(
      { type: 'drillIn', goalId: 'g1', changeId: 'g1.c1' },
      { type: 'jump', focus: { level: 'source' } },
    )

    expect(state).toMatchObject({ path: { level: 'source' }, direction: -1 })
  })

  it('opens a file in the files view and keeps the summary position', () => {
    const state = run({ type: 'drillIn', goalId: 'g1' }, { type: 'openFile', path: 'a.ts' })

    expect(state).toMatchObject({
      mode: 'files',
      file: 'a.ts',
      path: { level: 'goal', goalId: 'g1' },
    })
    expect(currentFocus(state)).toEqual({ level: 'file', path: 'a.ts' })
  })

  it('opens a change from the files view in the summary', () => {
    const state = run(
      { type: 'openFile', path: 'a.ts' },
      { type: 'openChange', goalId: 'g1', changeId: 'g1.c1' },
    )

    expect(state).toMatchObject({
      mode: 'summary',
      path: { level: 'change', changeId: 'g1.c1' },
      direction: 1,
    })
    expect(currentFocus(state)).toEqual(state.path)
  })

  it('drills out of the files view back to the summary', () => {
    const state = run({ type: 'openFile', path: 'a.ts' }, { type: 'drillOut' })

    expect(state.mode).toBe('summary')
  })
})

describe('breadcrumbs', () => {
  it('lists the overview, the goal, and the change', () => {
    const state = run({ type: 'drillIn', goalId: 'g1', changeId: 'g1.c1' })

    expect(breadcrumbs(state, summary).map((c) => c.label)).toEqual(['Overview', 'Retry', 'Wrap'])
  })

  it('lists only the overview before the summary is ready', () => {
    expect(breadcrumbs(run({ type: 'drillIn', goalId: 'g1' }), null).map((c) => c.label)).toEqual([
      'Overview',
    ])
  })
})
