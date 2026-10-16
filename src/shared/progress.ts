/**
 * Real progress of a summary. Each number counts real work:
 * - digesting: files that the map-reduce file pass finished.
 * - reading: tool calls of the agent. The total is not known, so `total` is 0.
 * - summarizing: hunks that the streamed summary put in a change.
 * - noting: hunks that the streamed summary gave a note.
 */
export interface SummaryProgress {
  plan: 'single' | 'map-reduce'
  phase: 'digesting' | 'reading' | 'summarizing' | 'noting'
  done: number
  total: number
  file?: string
  /** The last step of the agent in the reading phase, for example `Reading src/a.ts`. */
  activity?: string
}

const BANDS = {
  single: { digesting: [0, 0], reading: [0, 0.7], summarizing: [0.7, 0.85], noting: [0.85, 1] },
  'map-reduce': {
    digesting: [0, 0.3],
    reading: [0.3, 0.7],
    summarizing: [0.7, 0.85],
    noting: [0.85, 1],
  },
} as const

/** The number of steps that fills half of the reading band. */
const READING_HALF = 6

export function progressFraction(p: SummaryProgress): number {
  const [start, end] = BANDS[p.plan][p.phase]
  // Nobody knows how many steps the agent takes. Each step moves the bar, and it slows down so it never fills.
  const part =
    p.phase === 'reading'
      ? p.done / (p.done + READING_HALF)
      : p.total === 0
        ? 1
        : Math.min(p.done / p.total, 1)
  return start + (end - start) * part
}

export function progressLabel(p: SummaryProgress): string {
  const count = `${p.done} of ${p.total}`
  if (p.phase === 'digesting') return `The agent summarizes each file: ${count} files`
  if (p.phase === 'summarizing') return `The agent groups the hunks: ${count} hunks`
  if (p.phase === 'noting') return `The agent writes the hunk notes: ${count} hunks`
  if (p.done === 0) return 'The agent starts to read the code'
  const steps = `${p.done} ${p.done === 1 ? 'step' : 'steps'}`
  return `The agent reads the code: ${steps}${p.activity ? ` · ${p.activity}` : ''}`
}
