import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { simplify } from './simplify'

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

describe('simplify', () => {
  it('asks for the explanation again as for a child, in STE, and streams the text', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: 'The app ' },
            { type: 'text-delta', id: 't', delta: 'tries again.' },
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

    let text = ''
    for await (const delta of simplify({
      model,
      title: 'Add retry',
      text: 'The client wraps calls in retry with backoff.',
    })) {
      text += delta
    }

    expect(text).toBe('The app tries again.')
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(prompt).toContain('The client wraps calls in retry with backoff.')
    expect(prompt).toContain('Add retry')
    expect(prompt).toContain('child')
    expect(prompt).toContain('ASD-STE100')
  })
})
