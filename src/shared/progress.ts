/**
 * Real progress of a summary. Each number counts real work:
 * - digesting: files that the map-reduce file pass finished.
 * - reading: changed files that the agent opened with its tools.
 * - summarizing: hunks that the streamed summary put in a change.
 */
export interface SummaryProgress {
  plan: 'single' | 'map-reduce'
  phase: 'digesting' | 'reading' | 'summarizing'
  done: number
  total: number
  file?: string
}

const BANDS = {
  single: { digesting: [0, 0], reading: [0, 0.7], summarizing: [0.7, 1] },
  'map-reduce': { digesting: [0, 0.3], reading: [0.3, 0.7], summarizing: [0.7, 1] },
} as const

export function progressFraction(p: SummaryProgress): number {
  const [start, end] = BANDS[p.plan][p.phase]
  const part = p.total === 0 ? 1 : Math.min(p.done / p.total, 1)
  return start + (end - start) * part
}

export function progressLabel(p: SummaryProgress): string {
  const count = `${p.done} of ${p.total}`
  if (p.phase === 'digesting') return `The agent summarizes each file: ${count} files`
  if (p.phase === 'summarizing') return `The agent groups the hunks: ${count} hunks`
  return `The agent reads the code: ${count} files${p.file ? ` (${p.file})` : ''}`
}
