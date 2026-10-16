import { relative } from 'node:path'
import { streamText, type LanguageModel } from 'ai'
import type { Term, TermEvent } from '@shared/terms'
import { STE_RULES } from './style'

export interface ExplainTermRequest {
  model: LanguageModel
  /** The workspace folder. Tool paths are shown relative to it. */
  cwd: string
  /** The title of the source. */
  title: string
  term: Term
  /** The text where the user found the term. */
  context: string
  abortSignal?: AbortSignal
}

const KIND = {
  jargon: 'technical term',
  code: 'code concept',
  business: 'business concept',
} as const

const SYSTEM = `You explain one term to a code reviewer in a short popup.
Your working directory has the code of the change. Use the Read, Grep, and Glob tools when the term is part of this code base or this business.
Then write only the explanation: two to five short sentences. Do not tell about your search. Do not use Markdown or headings.
Mark each term in your explanation that a reader can ask about, in the form [[term|kind]].
The kind is jargon (a technical term), code (a concept of this code base), or business (a concept of this business).
Example: A [[migration|jargon]] adds rows to [[TaskTarget|code]] for each [[PA|business]].
Mark every name from the code and every business term that you use, not only some. Do not mark the term that you explain.

${STE_RULES}`

function describeTool(name: string, input: unknown, cwd: string): string | null {
  const i = (input ?? {}) as Record<string, unknown>
  const path =
    typeof i['file_path'] === 'string'
      ? i['file_path']
      : typeof i['path'] === 'string'
        ? i['path']
        : null
  if (name === 'Read' && path) return `Reading ${path.startsWith(cwd) ? relative(cwd, path) : path}`
  if (name === 'Grep' && typeof i['pattern'] === 'string') return `Searching for ${i['pattern']}`
  if (name === 'Glob' && typeof i['pattern'] === 'string') return `Finding files: ${i['pattern']}`
  return null
}

/** Explain a term. Yields what the agent reads, then the explanation text with [[term|kind]] markers. */
export async function* explainTerm(req: ExplainTermRequest): AsyncGenerator<TermEvent> {
  const { term } = req
  const result = streamText({
    model: req.model,
    system: SYSTEM,
    abortSignal: req.abortSignal,
    prompt: `Source: ${req.title}

The reader found this ${KIND[term.kind]} in this text:
${req.context}

Explain the ${KIND[term.kind]} "${term.term}".`,
  })
  let wrote = false
  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      if (wrote) {
        yield { type: 'reset' }
        wrote = false
      }
      const text = describeTool(part.toolName, part.input, req.cwd)
      if (text) yield { type: 'activity', text }
    } else if (part.type === 'text-delta' && part.text) {
      wrote = true
      yield { type: 'text', delta: part.text }
    }
  }
}
