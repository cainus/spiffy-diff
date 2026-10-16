import type { Focus } from '@shared/focus'
import type { Summary } from '@shared/summary'

type SummaryPath = Extract<Focus, { level: 'source' | 'goal' | 'change' }>

export interface NavState {
  mode: 'summary' | 'files'
  path: SummaryPath
  file: string | null
  /** 1 when you drill in, -1 when you drill out. The animations use it. */
  direction: 1 | -1
  /** The highlighted item of the list on the screen, for the arrow keys. Null shows no highlight. */
  cursor: number | null
}

export type NavAction =
  | { type: 'drillIn'; goalId: string; changeId?: string }
  | { type: 'drillOut'; cursor?: number }
  | { type: 'cursor'; index: number }
  | { type: 'jump'; focus: SummaryPath }
  | { type: 'mode'; mode: NavState['mode'] }
  | { type: 'openFile'; path: string }
  | { type: 'openChange'; goalId: string; changeId: string }

export const initialNav: NavState = {
  mode: 'summary',
  path: { level: 'source' },
  file: null,
  direction: 1,
  cursor: null,
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
        cursor: null,
      }
    case 'drillOut': {
      if (state.mode === 'files') return { ...state, mode: 'summary', direction: -1 }
      const { path } = state
      if (path.level === 'source') return state
      const up: SummaryPath =
        path.level === 'change' ? { level: 'goal', goalId: path.goalId } : { level: 'source' }
      return { ...state, path: up, direction: -1, cursor: action.cursor ?? null }
    }
    case 'jump':
      return {
        ...state,
        mode: 'summary',
        path: action.focus,
        direction: DEPTH[action.focus.level] > DEPTH[state.path.level] ? 1 : -1,
        cursor: null,
      }
    case 'cursor':
      return { ...state, cursor: action.index }
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
        cursor: null,
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

/** The short text of the focus chip in the agent panel. */
export function focusLabel(state: NavState, summary: Summary | null): string {
  if (state.mode === 'files' && state.file) return `File: ${state.file}`
  const crumbs = breadcrumbs(state, summary)
  const last = crumbs[crumbs.length - 1]!
  if (last.focus.level === 'change') return `Change: ${last.label}`
  if (last.focus.level === 'goal') return `Goal: ${last.label}`
  return last.label
}

/** A saved position, checked against a new summary. A part that is gone moves the position up. */
export function restoreNav(saved: NavState, summary: Summary, files: string[]): NavState {
  const { path } = saved
  let restored: NavState['path'] = { level: 'source' }
  if (path.level !== 'source') {
    const goal = summary.goals.find((g) => g.id === path.goalId)
    if (goal) {
      restored = { level: 'goal', goalId: goal.id }
      if (path.level === 'change' && goal.changes.some((c) => c.id === path.changeId))
        restored = path
    }
  }
  const file = saved.file && files.includes(saved.file) ? saved.file : null
  return { mode: saved.mode, path: restored, file, direction: 1, cursor: null }
}
