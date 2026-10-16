import { simulateReadableStream } from 'ai'

/** Mock model streams and answers for the tests of the model passes. */
export const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

export function streamJson(json: string) {
  const parts = json.match(/.{1,7}/gs) ?? []
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id: 't' },
        ...parts.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
        { type: 'text-end' as const, id: 't' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: undefined },
          logprobs: undefined,
          usage,
        },
      ],
    }),
  }
}

export function investigationStream(paths: string[], text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        ...paths.flatMap((path, i) => [
          {
            type: 'tool-call' as const,
            toolCallId: `t${i}`,
            toolName: 'Read',
            input: JSON.stringify({ file_path: path }),
            providerExecuted: true,
            dynamic: true,
          },
          {
            type: 'tool-result' as const,
            toolCallId: `t${i}`,
            toolName: 'Read',
            result: 'file text',
            dynamic: true,
          },
        ]),
        { type: 'text-start' as const, id: 'n' },
        { type: 'text-delta' as const, id: 'n', delta: text },
        { type: 'text-end' as const, id: 'n' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: undefined },
          logprobs: undefined,
          usage,
        },
      ],
    }),
  }
}

export function generateJson(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage,
    warnings: [],
  }
}
