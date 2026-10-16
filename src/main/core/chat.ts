import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import { describeFocus, type Focus } from '@shared/focus'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { STE_RULES } from './style'
import { estimateTokens, promptHunks } from './summarize'

export interface ChatRequest {
  model: LanguageModel
  source: LoadedSource
  summary: Summary | null
  messages: UIMessage[]
  focus: Focus
  abortSignal?: AbortSignal
  /** Above this many estimated tokens, the hunks stay out of the prompt. */
  diffBudget?: number
}

function outline(summary: Summary | null): string {
  if (!summary) return 'The summary is not ready yet.'
  const goals = summary.goals
    .map(
      (g) =>
        `- ${g.title}\n${g.changes.map((c) => `  - ${c.title} (hunks ${c.hunkIds.join(', ')})`).join('\n')}`,
    )
    .join('\n')
  return `${summary.overview}\n\nGoals:\n${goals}`
}

function diffSection(req: ChatRequest): string {
  const hunks = promptHunks(req.source.files)
  if (estimateTokens(hunks) > (req.diffBudget ?? 60_000)) {
    return 'The diff is too large to show here. Read the changed files in your working directory.'
  }
  return `The hunks of the diff (lockfiles and generated files are left out):\n\n${hunks}`
}

function system(req: ChatRequest): string {
  const { source } = req
  const files = source.files.map((f) => `- ${f.path} (${f.status})`).join('\n')
  return `You help a reviewer understand code changes. You can read the files of the head commit in your working directory. You cannot change files.
Show code with file paths when it helps.

${STE_RULES}

Source: ${source.title} (${source.repo}${source.prUrl ? `, ${source.prUrl}` : ''})
${source.body.trim() ? `Description:\n${source.body.trim()}\n` : ''}
Changed files:
${files}

Base commit: ${source.baseSha}
Head commit: ${source.headSha}

Summary:
${outline(req.summary)}

${diffSection(req)}

Focus: ${describeFocus(req.focus, req.summary, source.files)}`
}

/** Answer one chat turn as a stream of UI message chunks. */
export async function chatStream(req: ChatRequest): Promise<ReadableStream<UIMessageChunk>> {
  const result = streamText({
    model: req.model,
    system: system(req),
    messages: await convertToModelMessages(req.messages),
    abortSignal: req.abortSignal,
  })
  return toUIMessageStream({
    stream: result.fullStream,
    originalMessages: req.messages,
    // The default text is "An error occurred." The user needs the real cause.
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  })
}
