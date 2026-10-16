import { describe, expect, it } from 'vitest'
import type { Summary } from '@shared/summary'
import { arrowKey } from './keys'
import { initialNav, navReducer, type NavAction, type NavState } from './nav'

const change = (id: string) => ({ id, title: id, description: '', hunkIds: [] })
const summary: Summary = {
  overview: '',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'A',
      description: '',
      changes: [change('g1.c1'), change('g1.c2')],
    },
    { id: 'g2', kind: 'model', title: 'B', description: '', changes: [change('g2.c1')] },
  ],
}
const files = ['a.ts', 'b.ts', 'c.ts']

/** Press keys from a state, and give the end state. */
function press(state: NavState, ...keys: string[]): NavState {
  return keys.reduce((s, key) => {
    const action: NavAction | null = arrowKey(s, summary, files, key)
    return action ? navReducer(s, action) : s
  }, state)
}

describe('arrowKey', () => {
  it('moves the highlight down and up the goals, and stops at the ends', () => {
    expect(press(initialNav, 'ArrowDown').cursor).toBe(0)
    expect(press(initialNav, 'ArrowDown', 'ArrowDown').cursor).toBe(1)
    expect(press(initialNav, 'ArrowDown', 'ArrowDown', 'ArrowDown').cursor).toBe(1)
    expect(press(initialNav, 'ArrowDown', 'ArrowDown', 'ArrowUp').cursor).toBe(0)
    expect(press(initialNav, 'ArrowUp').cursor).toBe(0)
  })

  it('drills into the highlighted item with ArrowRight or Enter, and into the first item without a highlight', () => {
    expect(press(initialNav, 'ArrowDown', 'ArrowDown', 'ArrowRight').path).toEqual({
      level: 'goal',
      goalId: 'g2',
    })
    expect(press(initialNav, 'Enter').path).toEqual({ level: 'goal', goalId: 'g1' })
    expect(press(initialNav, 'ArrowRight', 'ArrowDown', 'ArrowDown', 'Enter').path).toEqual({
      level: 'change',
      goalId: 'g1',
      changeId: 'g1.c2',
    })
  })

  it('drills out with ArrowLeft and highlights the item that you came from', () => {
    const inChange = press(initialNav, 'ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowRight')
    expect(inChange.path).toEqual({ level: 'change', goalId: 'g2', changeId: 'g2.c1' })

    const inGoal = press(inChange, 'ArrowLeft')
    expect(inGoal).toMatchObject({
      path: { level: 'goal', goalId: 'g2' },
      cursor: 0,
      direction: -1,
    })
    expect(press(inGoal, 'ArrowLeft')).toMatchObject({ path: { level: 'source' }, cursor: 1 })
  })

  it('goes to the next and the last change of the goal inside a change', () => {
    const first = press(initialNav, 'Enter', 'Enter')
    expect(press(first, 'ArrowDown').path).toEqual({
      level: 'change',
      goalId: 'g1',
      changeId: 'g1.c2',
    })
    expect(press(first, 'ArrowDown', 'ArrowDown').path).toEqual({
      level: 'change',
      goalId: 'g1',
      changeId: 'g1.c2',
    })
    expect(press(first, 'ArrowDown', 'ArrowUp').path).toEqual({
      level: 'change',
      goalId: 'g1',
      changeId: 'g1.c1',
    })
    expect(arrowKey(first, summary, files, 'ArrowRight')).toBeNull()
  })

  it('goes to the next and the last file in the files view', () => {
    const inFiles: NavState = { ...initialNav, mode: 'files', file: 'a.ts' }
    expect(press(inFiles, 'ArrowDown').file).toBe('b.ts')
    expect(press(inFiles, 'ArrowDown', 'ArrowDown', 'ArrowDown').file).toBe('c.ts')
    expect(press(inFiles, 'ArrowUp').file).toBe('a.ts')
    expect(press(inFiles, 'ArrowLeft').mode).toBe('summary')
  })

  it('does nothing before the summary is ready, and for other keys', () => {
    expect(arrowKey(initialNav, null, files, 'ArrowDown')).toBeNull()
    expect(arrowKey(initialNav, summary, files, 'a')).toBeNull()
  })
})
