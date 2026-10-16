import { streamText, type LanguageModel } from 'ai'
import type { TermEvent } from '@shared/terms'
import { STE_RULES } from './style'
import { describeTool } from '@shared/tool-activity'

export interface ExplainTermRequest {
  model: LanguageModel
  /** The workspace folder. Tool paths are shown relative to it. */
  cwd: string
  /** The title of the source. */
  title: string
  /** The text that the user selected. */
  phrase: string
  /** The text where the user found the phrase. */
  context: string
  abortSignal?: AbortSignal
}

const SYSTEM = `You explain one phrase to a code reviewer in a short popup.
The phrase can be a technical term, a concept of this code base, or a concept of this business.
Your working directory has the code of the change. Use the Read, Grep, and Glob tools when the phrase is part of this code base or this business.
Then write only the explanation: two to five short sentences. Do not tell about your search. Do not use Markdown or headings.

${STE_RULES}`

/** Explain a phrase. Yields what the agent reads, then the explanation text. */
export async function* explainTerm(req: ExplainTermRequest): AsyncGenerator<TermEvent> {
  const result = streamText({
    model: req.model,
    system: SYSTEM,
    abortSignal: req.abortSignal,
    prompt: `Source: ${req.title}

The reader selected a phrase in this text:
${req.context}

Explain the phrase "${req.phrase}".`,
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

/** Pass the events through. When the stream ends, give the final explanation text to `onDone`. */
export async function* whenExplained(
  events: AsyncIterable<TermEvent>,
  onDone: (text: string) => Promise<void>,
): AsyncGenerator<TermEvent> {
  let text = ''
  for await (const e of events) {
    if (e.type === 'reset') text = ''
    else if (e.type === 'text') text += e.delta
    yield e
  }
  if (text.trim()) await onDone(text.trim())
}
