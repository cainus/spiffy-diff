import { streamText, type LanguageModel } from 'ai'
import { STE_RULES } from './style'

export interface SimplifyRequest {
  model: LanguageModel
  /** The title of the explanation, for example the goal title. */
  title: string
  text: string
  abortSignal?: AbortSignal
}

const SYSTEM = `You explain code changes to a child of about eight years old.
Use everyday words and a short, concrete comparison when it helps.
Keep every fact true. Do not add facts. Write at most five short sentences. Do not use Markdown.

${STE_RULES}`

/** Explain an explanation again, as for a child (ELI5). Yields the text as it streams. */
export async function* simplify(req: SimplifyRequest): AsyncGenerator<string> {
  const result = streamText({
    model: req.model,
    system: SYSTEM,
    abortSignal: req.abortSignal,
    prompt: `Explain this again as for a child.\n\nTitle: ${req.title}\n\nExplanation:\n${req.text}`,
  })
  for await (const delta of result.textStream) yield delta
}
