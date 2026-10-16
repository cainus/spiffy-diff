import { generateText, Output, streamText, type LanguageModel } from 'ai'
import { z } from 'zod'
import { hunkBlocks } from '@shared/blocks'
import type { DiffFile } from '@shared/diff'
import type { RerunDone, RerunEvent, RerunMode } from '@shared/rerun'
import type { LoadedSource } from '@shared/source'
import { CHANGE_KIND_TEXT, CHANGE_KINDS, type Summary } from '@shared/summary'
import { describeTool } from '@shared/tool-activity'
import { STE_RULES } from './style'

export interface RerunChangeRequest {
  model: LanguageModel
  cwd: string
  source: LoadedSource
  summary: Summary
  goalId: string
  changeId: string
  mode: RerunMode
  abortSignal?: AbortSignal
}

const LOOK = `You study one change of a code review for a reviewer.
Your working directory has the files of the head commit. The hunks show only what changed.
Use your tools: read the changed files around the hunks, find the callers of changed functions, and find the tests.
For each hunk, find why the change is necessary: the problem, the bug, or the need that it answers.
For each BEFORE block, find what the old code did in its context. For each NOW block, find what the new code does in its context.
Write short notes. Name the hunk IDs and the block IDs. Do not change files.`

const WRITE = `You write the notes of one change of a code review, from the notes of a reader of the code.
For each hunk, write "why": what the hunk changes and why that change is necessary. The reviewer must learn the reason, not only the edit.
For each block, write what its code does in its context. A BEFORE block is old code that the change removes: tell what it did. A NOW block is new code: tell what it does. Do not start with "Before" or "Now".

${STE_RULES}`

const hunkSchema = z.object({
  hunkId: z.string(),
  why: z
    .string()
    .describe('What this hunk changes and why that is necessary, in one or two short sentences.'),
  blocks: z
    .array(
      z.object({
        blockId: z.string(),
        text: z
          .string()
          .describe(
            'What the code of this block does in its context, in one or two short sentences.',
          ),
      }),
    )
    .describe('One entry for each block ID of the hunk.'),
})

const detailSchema = z.object({
  hunks: z.array(hunkSchema).describe('One entry for each hunk ID of the change.'),
})

const rerunSchema = z.object({
  title: z.string().describe('A short title for this set of code edits.'),
  description: z.string().describe('What this change does and why, in 1-3 sentences.'),
  kind: z.enum(CHANGE_KINDS).describe(CHANGE_KIND_TEXT),
  hunks: detailSchema.shape.hunks,
})

/** The hunks of the change, with the IDs of their BEFORE and NOW blocks. */
function promptBlocks(files: DiffFile[]): string {
  return files
    .flatMap((f) =>
      f.hunks.map((h) => {
        const blocks = hunkBlocks(h)
          .map((b) => `[${b.id} ${b.kind === 'before' ? 'BEFORE' : 'NOW'}]\n${b.text}`)
          .join('\n')
        return `[${h.id}] ${f.path}\n${h.patch}\n\nBlocks of ${h.id}:\n${blocks}`
      }),
    )
    .join('\n\n')
}

/**
 * Write the notes of one change. The agent reads the code first. `detail` writes the why note of
 * each hunk and the note of each block. `rerun` also writes the title and the description.
 * The hunks of the change do not move.
 */
export async function* rerunChange(req: RerunChangeRequest): AsyncGenerator<RerunEvent> {
  const goal = req.summary.goals.find((g) => g.id === req.goalId)
  const change = goal?.changes.find((c) => c.id === req.changeId)
  if (!goal || !change) throw new Error(`The summary has no change ${req.changeId}.`)

  const ids = new Set(change.hunkIds)
  const files = req.source.files
    .map((f) => ({ ...f, hunks: f.hunks.filter((h) => ids.has(h.id)) }))
    .filter((f) => f.hunks.length > 0)
  const blockIds = new Set(
    files.flatMap((f) => f.hunks.flatMap((h) => hunkBlocks(h).map((b) => b.id))),
  )
  const context = `Source: ${req.source.title}
Goal: ${goal.title}. ${goal.description}
The change: ${change.title}. ${change.description}

Hunks of the change:

${promptBlocks(files)}`

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
  const prompt = `${context}\n\nNotes from reading the code:\n${findings}`
  const options = { model: req.model, system: WRITE, abortSignal: req.abortSignal, prompt }
  const done: RerunDone = { type: 'done', hunkNotes: {}, blockNotes: {} }
  let hunks: z.infer<typeof hunkSchema>[]
  if (req.mode === 'rerun') {
    const { output } = await generateText({
      ...options,
      output: Output.object({ schema: rerunSchema }),
    })
    done.title = output.title.trim()
    done.description = output.description.trim()
    done.kind = output.kind
    hunks = output.hunks
  } else {
    hunks = (await generateText({ ...options, output: Output.object({ schema: detailSchema }) }))
      .output.hunks
  }
  for (const h of hunks) {
    if (!ids.has(h.hunkId)) continue
    if (h.why.trim()) done.hunkNotes[h.hunkId] = h.why.trim()
    for (const b of h.blocks)
      if (blockIds.has(b.blockId) && b.text.trim()) done.blockNotes[b.blockId] = b.text.trim()
  }
  yield done
}
