import { z } from 'zod'
import type { DiffFile } from './diff'
import { isNoise } from './noise'

export const OTHER_GOAL_TITLE = 'Other changes'
export const NOISE_GOAL_TITLE = 'Generated & lockfiles'

/** The shape that the model returns. See ADR 0002. */
export const modelSummarySchema = z.object({
  overview: z.string().describe('Two or three sentences that explain the whole source.'),
  goals: z
    .array(
      z.object({
        title: z.string().describe('A short imperative title, for example "Add retry to the payment client".'),
        description: z.string().describe('Why this goal exists and what it does, in 2-4 sentences.'),
        changes: z.array(
          z.object({
            title: z.string().describe('A short title for one related set of code edits.'),
            description: z.string().describe('What this change does and why, in 1-3 sentences.'),
            hunkIds: z.array(z.string()).describe('The IDs of the hunks that implement this change.'),
          }),
        ),
      }),
    )
    .describe('The main goals, most important first.'),
})

export type ModelSummary = z.infer<typeof modelSummarySchema>

export interface Change {
  id: string
  title: string
  description: string
  hunkIds: string[]
}

export type GoalKind = 'model' | 'other' | 'noise'

export interface Goal {
  id: string
  kind: GoalKind
  title: string
  description: string
  changes: Change[]
}

export interface Summary {
  overview: string
  goals: Goal[]
}

interface DraftGoal {
  kind: GoalKind
  title: string
  description: string
  changes: Omit<Change, 'id'>[]
}

function changesByFile(files: DiffFile[], keep: (hunkId: string) => boolean): Omit<Change, 'id'>[] {
  return files
    .map((f) => ({ title: f.path, description: '', hunkIds: f.hunks.map((h) => h.id).filter(keep) }))
    .filter((c) => c.hunkIds.length > 0)
}

/** Turn the model answer into a summary that covers every hunk. See ADR 0002. */
export function buildSummary(model: ModelSummary, files: DiffFile[]): Summary {
  const noise = new Set(files.filter((f) => isNoise(f.path)).flatMap((f) => f.hunks.map((h) => h.id)))
  const reviewable = new Set(files.flatMap((f) => f.hunks.map((h) => h.id)).filter((id) => !noise.has(id)))
  const covered = new Set<string>()

  const drafts: DraftGoal[] = model.goals.map((g) => ({
    kind: 'model',
    title: g.title,
    description: g.description,
    changes: g.changes
      .map((c) => {
        const hunkIds = c.hunkIds.filter((id) => reviewable.has(id))
        hunkIds.forEach((id) => covered.add(id))
        return { title: c.title, description: c.description, hunkIds }
      })
      .filter((c) => c.hunkIds.length > 0),
  }))

  drafts.push({
    kind: 'other',
    title: OTHER_GOAL_TITLE,
    description: 'Hunks that no goal explains.',
    changes: changesByFile(files, (id) => reviewable.has(id) && !covered.has(id)),
  })
  drafts.push({
    kind: 'noise',
    title: NOISE_GOAL_TITLE,
    description: 'Lockfiles, generated files, snapshots, and vendored code.',
    changes: changesByFile(files, (id) => noise.has(id)),
  })

  const goals = drafts
    .filter((g) => g.changes.length > 0)
    .map((g, gi): Goal => {
      const id = `g${gi + 1}`
      return { ...g, id, changes: g.changes.map((c, ci) => ({ ...c, id: `${id}.c${ci + 1}` })) }
    })

  return { overview: model.overview, goals }
}

export interface HunkOwner {
  goalId: string
  changeId: string
}

/** Map each hunk ID to the goals and changes that use it. */
export function hunkOwners(summary: Summary): Map<string, HunkOwner[]> {
  const owners = new Map<string, HunkOwner[]>()
  for (const goal of summary.goals) {
    for (const change of goal.changes) {
      for (const id of change.hunkIds) {
        const list = owners.get(id) ?? []
        list.push({ goalId: goal.id, changeId: change.id })
        owners.set(id, list)
      }
    }
  }
  return owners
}
