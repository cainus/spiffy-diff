import type { Summary } from '@shared/summary'
import type { NavAction, NavState } from './nav'

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max))

/**
 * The navigation action of an arrow key, or null.
 * - Up and Down move the highlight in the list. In a change, they go to the last or next change.
 *   In the files view, they go to the last or next file.
 * - Right and Enter drill into the highlighted item, or into the first item.
 * - Left drills out, and highlights the item that you came from.
 */
export function arrowKey(
  nav: NavState,
  summary: Summary | null,
  files: string[],
  key: string,
): NavAction | null {
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  const into = key === 'ArrowRight' || key === 'Enter'
  const out = key === 'ArrowLeft'
  if (!step && !into && !out) return null

  if (nav.mode === 'files') {
    if (out) return { type: 'drillOut' }
    if (!step || files.length === 0) return null
    const at = nav.file ? files.indexOf(nav.file) : -1
    return { type: 'openFile', path: files[clamp(at + step, files.length - 1)]! }
  }
  if (!summary) return null

  const { path } = nav
  const goal = path.level === 'source' ? null : summary.goals.find((g) => g.id === path.goalId)

  if (out) {
    if (path.level === 'change' && goal) {
      return { type: 'drillOut', cursor: goal.changes.findIndex((c) => c.id === path.changeId) }
    }
    if (path.level === 'goal')
      return { type: 'drillOut', cursor: summary.goals.findIndex((g) => g.id === path.goalId) }
    return null
  }

  if (path.level === 'change') {
    if (!step || !goal) return null
    const at = goal.changes.findIndex((c) => c.id === path.changeId)
    const next = goal.changes[clamp(at + step, goal.changes.length - 1)]!
    return next.id === path.changeId
      ? null
      : { type: 'jump', focus: { level: 'change', goalId: goal.id, changeId: next.id } }
  }

  const count = path.level === 'source' ? summary.goals.length : (goal?.changes.length ?? 0)
  if (count === 0) return null
  if (step)
    return { type: 'cursor', index: nav.cursor === null ? 0 : clamp(nav.cursor + step, count - 1) }
  const index = clamp(nav.cursor ?? 0, count - 1)
  if (path.level === 'source') return { type: 'drillIn', goalId: summary.goals[index]!.id }
  return { type: 'drillIn', goalId: goal!.id, changeId: goal!.changes[index]!.id }
}
