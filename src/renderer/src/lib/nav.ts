import type { Focus } from '@shared/focus'
import type { Summary } from '@shared/summary'

type SummaryPath = Extract<Focus, { level: 'source' | 'goal' | 'change' }>

export interface NavState {
  mode: 'summary' | 'files'
  path: SummaryPath
  file: string | null
  /** 1 when you drill in, -1 when you drill out. The animations use it. */
  direction: 1 | -1
}

export type NavAction =
  | { type: 'drillIn'; goalId: string; changeId?: string }
  | { type: 'drillOut' }
  | { type: 'jump'; focus: SummaryPath }
  | { type: 'mode'; mode: NavState['mode'] }
  | { type: 'openFile'; path: string }
  | { type: 'openChange'; goalId: string; changeId: string }

export const initialNav: NavState = {
  mode: 'summary',
  path: { level: 'source' },
  file: null,
  direction: 1,
}

const DEPTH = { source: 0, goal: 1, change: 2 } as const

function toPath(goalId: string, changeId?: string): SummaryPath {
  return changeId ? { level: 'change', goalId, changeId } : { level: 'goal', goalId }
}

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'drillIn':
      return {
        ...state,
        mode: 'summary',
        path: toPath(action.goalId, action.changeId),
        direction: 1,
      }
    case 'drillOut': {
      if (state.mode === 'files') return { ...state, mode: 'summary', direction: -1 }
      const { path } = state
      if (path.level === 'source') return state
      const up: SummaryPath =
        path.level === 'change' ? { level: 'goal', goalId: path.goalId } : { level: 'source' }
      return { ...state, path: up, direction: -1 }
    }
    case 'jump':
      return {
        ...state,
        mode: 'summary',
        path: action.focus,
        direction: DEPTH[action.focus.level] > DEPTH[state.path.level] ? 1 : -1,
      }
    case 'mode':
      return { ...state, mode: action.mode }
    case 'openFile':
      return { ...state, mode: 'files', file: action.path }
    case 'openChange':
      return {
        ...state,
        mode: 'summary',
        path: toPath(action.goalId, action.changeId),
        direction: 1,
      }
  }
}

export function currentFocus(state: NavState): Focus {
  return state.mode === 'files' && state.file ? { level: 'file', path: state.file } : state.path
}

export interface Crumb {
  label: string
  focus: SummaryPath
}

export function breadcrumbs(state: NavState, summary: Summary | null): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Overview', focus: { level: 'source' } }]
  const { path } = state
  if (!summary || path.level === 'source') return crumbs
  const goal = summary.goals.find((g) => g.id === path.goalId)
  if (!goal) return crumbs
  crumbs.push({ label: goal.title, focus: { level: 'goal', goalId: goal.id } })
  if (path.level === 'change') {
    const change = goal.changes.find((c) => c.id === path.changeId)
    if (change) crumbs.push({ label: change.title, focus: path })
  }
  return crumbs
}
