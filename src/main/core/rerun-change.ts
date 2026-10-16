import { generateText, Output, streamText, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { RerunEvent } from '@shared/rerun'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { describeTool } from '@shared/tool-activity'
import { STE_RULES } from './style'
import { promptHunks } from './summarize'

export interface RerunChangeRequest {
  model: LanguageModel
  cwd: string
  source: LoadedSource
  summary: Summary
  goalId: string
  changeId: string
  abortSignal?: AbortSignal
}

const LOOK = `You check one change of a code review summary again.
Your working directory has the files of the head commit. The hunks show only what changed.
Use your tools: read the changed files around the hunks, find the callers of changed functions, and find the tests.
Find what this change does and why it exists. Write short notes. Name the hunk IDs. Do not change files.`

const WRITE = `You write one change of a code review summary again, from the notes of a reader of the code.
Write a short title, a description of 1-3 sentences, and one note for each hunk.

${STE_RULES}`

const schema = z.object({
  title: z.string().describe('A short title for this set of code edits.'),
  description: z.string().describe('What this change does and why, in 1-3 sentences.'),
  hunkNotes: z
    .array(
      z.object({
        hunkId: z.string(),
        note: z.string().describe('What this hunk does and why, in one or two short sentences.'),
      }),
    )
    .describe('One note for each hunk ID of the change.'),
})

/**
 * Write one change again. The agent reads the code first, then writes the title, the description,
 * and the hunk notes. The hunks of the change do not move.
 */
export async function* rerunChange(req: RerunChangeRequest): AsyncGenerator<RerunEvent> {
  const goal = req.summary.goals.find((g) => g.id === req.goalId)
  const change = goal?.changes.find((c) => c.id === req.changeId)
  if (!goal || !change) throw new Error(`The summary has no change ${req.changeId}.`)

  const ids = new Set(change.hunkIds)
  const files = req.source.files
    .map((f) => ({ ...f, hunks: f.hunks.filter((h) => ids.has(h.id)) }))
    .filter((f) => f.hunks.length > 0)
  const context = `Source: ${req.source.title}
Goal: ${goal.title}. ${goal.description}
The change now: ${change.title}. ${change.description}

Hunks of the change:

${promptHunks(files)}`

  const look = streamText({
    model: req.model,
    system: LOOK,
    abortSignal: req.abortSignal,
    prompt: context,
  })
  for await (const part of look.fullStream) {
    if (part.type === 'tool-call') {
      yield {
        type: 'activity',
        text: describeTool(part.toolName, part.input, req.cwd) ?? `Using ${part.toolName}`,
      }
    }
  }
  const findings = (await look.text).trim()

  yield { type: 'activity', text: 'Writing the change' }
  const { output } = await generateText({
    model: req.model,
    system: WRITE,
    output: Output.object({ schema }),
    abortSignal: req.abortSignal,
    prompt: `${context}\n\nNotes from reading the code:\n${findings}`,
  })
  const hunkNotes: Record<string, string> = {}
  for (const n of output.hunkNotes)
    if (ids.has(n.hunkId) && n.note.trim()) hunkNotes[n.hunkId] = n.note.trim()
  yield {
    type: 'done',
    title: output.title.trim(),
    description: output.description.trim(),
    hunkNotes,
  }
}
