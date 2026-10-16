import type { Summary } from './summary'

/** `detail` writes the notes of a change the first time it shows. `rerun` also writes its title and description. */
export type RerunMode = 'detail' | 'rerun'

export interface RerunDone {
  type: 'done'
  title?: string
  description?: string
  /** The margin note of each hunk: what it changes and why. */
  hunkNotes: Record<string, string>
  /** The hover note of each block: what the old or the new code does. */
  blockNotes: Record<string, string>
}

/** One event while the agent writes one change again. */
export type RerunEvent = { type: 'activity'; text: string } | RerunDone

/** Put the new text of one change in the summary. The hunks of the change stay the same. */
export function applyRerun(
  summary: Summary,
  goalId: string,
  changeId: string,
  done: RerunDone,
): Summary {
  return {
    ...summary,
    goals: summary.goals.map((g) =>
      g.id !== goalId
        ? g
        : {
            ...g,
            changes: g.changes.map((c) =>
              c.id === changeId
                ? {
                    ...c,
                    title: done.title ?? c.title,
                    description: done.description ?? c.description,
                  }
                : c,
            ),
          },
    ),
    hunkNotes: { ...summary.hunkNotes, ...done.hunkNotes },
    blockNotes: { ...summary.blockNotes, ...done.blockNotes },
    detailed: [...new Set([...(summary.detailed ?? []), changeId])],
  }
}
