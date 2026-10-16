import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import type { TermEvent } from '@shared/terms'
import { explainTerm, whenExplained } from './explain-term'

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function call(id: string, toolName: string, input: object) {
  return [
    {
      type: 'tool-call' as const,
      toolCallId: id,
      toolName,
      input: JSON.stringify(input),
      providerExecuted: true,
      dynamic: true,
    },
    { type: 'tool-result' as const, toolCallId: id, toolName, result: 'ok', dynamic: true },
  ]
}

describe('explainTerm', () => {
  it('reports what the agent reads, then streams the explanation with term markers', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            ...call('a', 'Grep', { pattern: 'sla3_pa_fallback' }),
            ...call('b', 'Read', { file_path: '/ws/backend/app/models.py' }),
            ...call('c', 'Glob', { pattern: '**/sla3*.py' }),
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: 'A flag on a TargetSpec.' },
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

    const events: TermEvent[] = []
    for await (const e of explainTerm({
      model,
      cwd: '/ws',
      title: 'PD-2157: SLA 3',
      phrase: 'sla3_pa_fallback',
      context: 'Only sites marked sla3_pa_fallback keep the PA route.',
    })) {
      events.push(e)
    }

    expect(events).toEqual([
      { type: 'activity', text: 'Searching for sla3_pa_fallback' },
      { type: 'activity', text: 'Reading backend/app/models.py' },
      { type: 'activity', text: 'Finding files: **/sla3*.py' },
      { type: 'text', delta: 'A flag on a TargetSpec.' },
    ])
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(prompt).toContain('sla3_pa_fallback')
    expect(prompt).toContain(
      'technical term, a concept of this code base, or a concept of this business',
    )
    expect(prompt).toContain('Only sites marked sla3_pa_fallback keep the PA route.')
    expect(prompt).not.toContain('[[')
    expect(prompt).toContain('ASD-STE100')
  })

  it('clears text that the agent wrote before it used a tool, because that text narrates the search', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Let me look.' },
            { type: 'text-end', id: 't1' },
            ...call('a', 'Read', { file_path: '/ws/a.py' }),
            { type: 'text-start', id: 't2' },
            { type: 'text-delta', id: 't2', delta: 'The answer.' },
            { type: 'text-end', id: 't2' },
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

    const events: TermEvent[] = []
    for await (const e of explainTerm({
      model,
      cwd: '/ws',
      title: 't',
      phrase: 'x',
      context: '',
    })) {
      events.push(e)
    }

    expect(events).toEqual([
      { type: 'text', delta: 'Let me look.' },
      { type: 'reset' },
      { type: 'activity', text: 'Reading a.py' },
      { type: 'text', delta: 'The answer.' },
    ])
  })

  it('passes events through and gives the final text when the stream ends', async () => {
    async function* events(): AsyncGenerator<TermEvent> {
      yield { type: 'text', delta: 'Let me look.' }
      yield { type: 'reset' }
      yield { type: 'activity', text: 'Reading a.py' }
      yield { type: 'text', delta: 'The ' }
      yield { type: 'text', delta: 'answer.' }
    }
    const done: string[] = []

    const seen: TermEvent[] = []
    for await (const e of whenExplained(events(), async (text) => void done.push(text)))
      seen.push(e)

    expect(seen).toHaveLength(5)
    expect(done).toEqual(['The answer.'])
  })

  it('does not save an empty explanation', async () => {
    async function* events(): AsyncGenerator<TermEvent> {
      yield { type: 'activity', text: 'Reading a.py' }
    }
    const done: string[] = []

    for await (const _ of whenExplained(events(), async (text) => void done.push(text))) void _

    expect(done).toEqual([])
  })
})
