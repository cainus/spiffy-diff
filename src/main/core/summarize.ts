import { generateText, Output, streamText, type DeepPartial, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { DiffFile } from '@shared/diff'
import { isNoise } from '@shared/noise'
import type { SummaryProgress } from '@shared/progress'
import type { LoadedSource } from '@shared/source'
import { STE_RULES } from './style'
import { describeTool } from '@shared/tool-activity'
import { buildSummary, modelSummarySchema, type ModelSummary, type Summary } from '@shared/summary'

type PartialSummary = DeepPartial<ModelSummary>

export interface SummarizeOptions {
  model: LanguageModel
  /** Above this many estimated tokens of hunks, spiffy uses map-reduce. */
  tokenBudget?: number
  /** How many file summaries run at the same time in map-reduce. */
  concurrency?: number
  /** The workspace folder. Progress shows tool paths relative to it. */
  cwd?: string
  onPartial?: (partial: PartialSummary) => void
  /** Read the code with tools first, to find why it changed. */
  investigate?: boolean
  onProgress?: (progress: SummaryProgress) => void
  abortSignal?: AbortSignal
}

const INVESTIGATE = `You prepare notes for a code reviewer.
Your working directory has the files of the head commit. The hunks show only what changed.
Use your tools: read each changed file around its hunks, find the callers of changed functions, and find the tests.
Find why each change exists and what it affects.
Write short notes. Name the hunk IDs and the file paths. Do not change files.`

const DEFAULT_BUDGET = 100_000

const INSTRUCTIONS = `You explain code changes to a reviewer from the top down.
Find the main goals of the changes. A goal is one purpose, for example "Add retry to the payment client".
Put the most important goal first. Use few goals: one to five for most changes.
For each goal, list the changes. A change is one related set of code edits that serves the goal.
Attach hunks to changes with their hunk IDs, for example "h3". Use only hunk IDs that you see.
Attach every hunk to at least one change.
Use the findings from the code to write why each change exists, not only what it does.
Write one note for each hunk: what the hunk does and why.

${STE_RULES}`

function reviewable(files: DiffFile[]): DiffFile[] {
  return files.filter((f) => !isNoise(f.path))
}

function readableFiles(files: DiffFile[]): DiffFile[] {
  return reviewable(files).filter((f) => !f.binary && f.hunks.length > 0)
}

function fileHeader(f: DiffFile): string {
  return f.status === 'renamed' ? `${f.oldPath} -> ${f.path} (renamed)` : `${f.path} (${f.status})`
}

/** The hunks as the model sees them. Noise is left out. See ADR 0002. */
export function promptHunks(files: DiffFile[]): string {
  return reviewable(files)
    .map((f) =>
      f.binary
        ? `Binary file changed: ${f.path}`
        : f.hunks.map((h) => `[${h.id}] ${fileHeader(f)}\n${h.patch}`).join('\n\n'),
    )
    .join('\n\n')
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function choosePlan(files: DiffFile[], budget: number): 'single' | 'map-reduce' {
  return estimateTokens(promptHunks(files)) <= budget ? 'single' : 'map-reduce'
}

function sourceIntro(source: LoadedSource): string {
  const body = source.body.trim() ? `\n\nDescription:\n${source.body.trim()}` : ''
  return `Title: ${source.title}${body}`
}

const fileDigestSchema = z.object({
  summary: z.string().describe('What the edits in this file do, in 1-3 sentences.'),
  hunks: z.array(z.object({ id: z.string(), what: z.string().describe('One sentence.') })),
})

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

interface Digest {
  text: string
  notes: Record<string, string>
}

async function digestFiles(source: LoadedSource, opts: SummarizeOptions): Promise<Digest> {
  const files = readableFiles(source.files)
  const notes: Record<string, string> = {}
  let done = 0
  const report = (file?: string): void =>
    opts.onProgress?.({ plan: 'map-reduce', phase: 'digesting', done, total: files.length, file })
  report()
  const digests = await mapLimit(files, opts.concurrency ?? 4, async (f) => {
    const { output } = await generateText({
      model: opts.model,
      system: STE_RULES,
      output: Output.object({ schema: fileDigestSchema }),
      abortSignal: opts.abortSignal,
      prompt: `${sourceIntro(source)}\n\nSummarize the edits in one file. Describe each hunk in one sentence.\n\n${promptHunks([f])}`,
    })
    for (const h of output.hunks) notes[h.id] = h.what
    done++
    report(f.path)
    const hunks = output.hunks.map((h) => `  [${h.id}] ${h.what}`).join('\n')
    return `${fileHeader(f)}: ${output.summary}\n${hunks}`
  })
  return { text: digests.join('\n\n'), notes }
}

/** Make the summary of a source. See PLAN.md decision 10. */
export async function summarize(source: LoadedSource, opts: SummarizeOptions): Promise<Summary> {
  const plan = choosePlan(source.files, opts.tokenBudget ?? DEFAULT_BUDGET)
  const digest = plan === 'single' ? null : await digestFiles(source, opts)
  const body = digest
    ? `The changes are too large to show in full. These are summaries of each file and each hunk:\n\n${digest.text}`
    : `Hunks:\n\n${promptHunks(source.files)}`

  let findings = ''
  if (opts.investigate) {
    findings = `Findings from reading the code:\n${(await investigate(source, body, plan, opts)).trim()}\n\n`
  }

  const result = streamText({
    model: opts.model,
    system: INSTRUCTIONS,
    output: Output.object({ schema: modelSummarySchema }),
    abortSignal: opts.abortSignal,
    prompt: `${sourceIntro(source)}\n\n${findings}${body}`,
  })
  const hunkIds = new Set(readableFiles(source.files).flatMap((f) => f.hunks.map((h) => h.id)))
  let placed = 0
  let noted = 0
  const report = (phase: 'summarizing' | 'noting', done: number): void =>
    opts.onProgress?.({ plan, phase, done, total: hunkIds.size })
  report('summarizing', 0)
  for await (const partial of result.partialOutputStream) {
    if (!isWellFormed(partial)) continue
    opts.onPartial?.(partial)
    // The model writes the goals first, then the hunk notes.
    const notes = countNoted(partial, hunkIds)
    if (notes > noted) report('noting', (noted = notes))
    else if (noted === 0) {
      const now = countPlaced(partial, hunkIds)
      if (now > placed) report('summarizing', (placed = now))
    }
  }
  const summary = buildSummary(await finalObject(result), source.files)
  // In map-reduce, the hunk descriptions of the file pass fill the notes that the model left out.
  const fromDigest = buildSummary(
    {
      overview: '',
      goals: [],
      hunkNotes: Object.entries(digest?.notes ?? {}).map(([hunkId, note]) => ({ hunkId, note })),
    },
    source.files,
  ).hunkNotes
  // The coverage check puts every hunk in a change, and the notes are done. The bar must not move back.
  report('noting', hunkIds.size)
  return { ...summary, hunkNotes: { ...fromDigest, ...summary.hunkNotes } }
}

function countNoted(partial: PartialSummary, hunkIds: Set<string>): number {
  const noted = new Set<string>()
  for (const n of partial.hunkNotes ?? [])
    if (n?.hunkId && n.note && hunkIds.has(n.hunkId)) noted.add(n.hunkId)
  return noted.size
}

function countPlaced(partial: PartialSummary, hunkIds: Set<string>): number {
  const placed = new Set<string>()
  for (const g of partial.goals ?? []) {
    for (const c of g?.changes ?? []) {
      for (const id of c?.hunkIds ?? []) if (id && hunkIds.has(id)) placed.add(id)
    }
  }
  return placed.size
}

/** The investigation pass. It reports each tool call of the agent. */
async function investigate(
  source: LoadedSource,
  body: string,
  plan: SummaryProgress['plan'],
  opts: SummarizeOptions,
): Promise<string> {
  let steps = 0
  const report = (activity?: string): void =>
    opts.onProgress?.({ plan, phase: 'reading', done: steps, total: 0, activity })
  report()
  const result = streamText({
    model: opts.model,
    system: INVESTIGATE,
    abortSignal: opts.abortSignal,
    prompt: `${sourceIntro(source)}\n\n${body}`,
  })
  let writing = false
  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      steps++
      writing = false
      report(describeTool(part.toolName, part.input, opts.cwd) ?? `Using ${part.toolName}`)
    } else if (part.type === 'text-delta' && !writing) {
      writing = true
      report('Writing the findings')
    }
  }
  return result.text
}

function isWellFormed(p: unknown): p is PartialSummary {
  if (typeof p !== 'object' || p === null) return false
  const { overview, goals } = p as Record<string, unknown>
  return (
    (overview === undefined || typeof overview === 'string') &&
    (goals === undefined || Array.isArray(goals))
  )
}

async function finalObject(result: {
  output: PromiseLike<ModelSummary>
  text: PromiseLike<string>
}): Promise<ModelSummary> {
  try {
    return await result.output
  } catch (error) {
    const recovered = lastValidObject(await result.text)
    if (recovered) return recovered
    throw error
  }
}

/**
 * Some providers send broken text before the real JSON object, for example
 * `{"goals": {"overview": ...}}` or an incomplete object followed by the full one.
 * This returns the last balanced JSON object in the text that matches the schema.
 */
function lastValidObject(text: string): ModelSummary | null {
  let found: ModelSummary | null = null
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = matchingBrace(text, start)
    if (end === -1) continue
    try {
      const parsed = modelSummarySchema.safeParse(JSON.parse(text.slice(start, end + 1)))
      if (parsed.success) found = parsed.data
    } catch {
      // Not JSON. Try the next brace.
    }
  }
  return found
}

function matchingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}
