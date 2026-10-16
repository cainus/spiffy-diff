import type { Summary } from './summary'

/** One event while the agent writes one change again. */
export type RerunEvent =
  | { type: 'activity'; text: string }
  | { type: 'done'; title: string; description: string; hunkNotes: Record<string, string> }

/** Put the new text of one change in the summary. The hunks of the change stay the same. */
export function applyRerun(
  summary: Summary,
  goalId: string,
  changeId: string,
  done: Extract<RerunEvent, { type: 'done' }>,
): Summary {
  return {
    ...summary,
    goals: summary.goals.map((g) =>
      g.id !== goalId
        ? g
        : {
            ...g,
            changes: g.changes.map((c) =>
              c.id === changeId ? { ...c, title: done.title, description: done.description } : c,
            ),
          },
    ),
    hunkNotes: { ...summary.hunkNotes, ...done.hunkNotes },
  }
}
