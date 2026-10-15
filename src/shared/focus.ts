import type { DiffFile } from './diff'
import type { Summary } from './summary'

/** What the user looks at now. See CONTEXT.md "Focus". */
export type Focus =
  | { level: 'source' }
  | { level: 'goal'; goalId: string }
  | { level: 'change'; goalId: string; changeId: string }
  | { level: 'file'; path: string }

const WHOLE = 'The user looks at the whole source.'

/** A short text for the agent that tells it what the user looks at. */
export function describeFocus(focus: Focus, summary: Summary | null, files: DiffFile[]): string {
  if (focus.level === 'file') return `The user looks at the diff of the file ${focus.path}.`
  if (focus.level === 'source' || !summary) return WHOLE

  const goal = summary.goals.find((g) => g.id === focus.goalId)
  if (!goal) return WHOLE
  if (focus.level === 'goal') {
    return `The user looks at the goal "${goal.title}": ${goal.description}`
  }

  const change = goal.changes.find((c) => c.id === focus.changeId)
  if (!change) return `The user looks at the goal "${goal.title}": ${goal.description}`
  const hunks = files.flatMap((f) => f.hunks).filter((h) => change.hunkIds.includes(h.id))
  const code = hunks.map((h) => `${h.path}\n${h.patch}`).join('\n\n')
  return `The user looks at the change "${change.title}" in the goal "${goal.title}": ${change.description}\n\nThe code of the change:\n\n${code}`
}
