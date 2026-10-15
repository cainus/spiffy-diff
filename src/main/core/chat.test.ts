import { simulateReadableStream, type UIMessage, type UIMessageChunk } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { chatStream } from './chat'

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 'Add retry',
  body: '',
  prUrl: null,
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: parseDiff(''),
}

const summary: Summary = {
  overview: 'Adds retry to the client.',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'Retry failed calls',
      description: 'Calls fail.',
      changes: [],
    },
  ],
}

const messages: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Why?' }] }]

async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

describe('chatStream', () => {
  it('tells the agent about the source, the summary, and the focus, and streams the answer', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: 'Because ' },
            { type: 'text-delta', id: 't', delta: 'calls fail.' },
            { type: 'text-end', id: 't' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              logprobs: undefined,
              usage,
            },
          ],
        }),
      }),
    })

    const chunks = await collect(
      await chatStream({
        model,
        source,
        summary,
        messages,
        focus: { level: 'goal', goalId: 'g1' },
      }),
    )

    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(prompt).toContain('Add retry')
    expect(prompt).toContain('Adds retry to the client.')
    expect(prompt).toContain('goal \\"Retry failed calls\\"')
    expect(prompt).toContain('Why?')
    expect(prompt).toContain('ASD-STE100')
    const text = chunks.flatMap((c) => (c.type === 'text-delta' ? [c.delta] : [])).join('')
    expect(text).toBe('Because calls fail.')
  })
})
