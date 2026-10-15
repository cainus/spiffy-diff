import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { ModelSummary } from '@shared/summary'
import type { LoadedSource } from '@shared/source'
import { choosePlan, promptHunks, summarize } from './summarize'

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function streamJson(json: string) {
  const parts = json.match(/.{1,7}/gs) ?? []
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start' as const, id: 't' },
        ...parts.map((delta) => ({ type: 'text-delta' as const, id: 't', delta })),
        { type: 'text-end' as const, id: 't' },
        { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, logprobs: undefined, usage },
      ],
    }),
  }
}

function generateJson(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage,
    warnings: [],
  }
}

const diff = `diff --git a/src/retry.ts b/src/retry.ts
--- a/src/retry.ts
+++ b/src/retry.ts
@@ -1 +1,2 @@
 export const tries = 1
+export const backoff = 2
diff --git a/src/client.ts b/src/client.ts
--- a/src/client.ts
+++ b/src/client.ts
@@ -10 +10 @@
-call()
+retry(call)
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-{"v":1}
+{"v":2}
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
`

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 'Add retry',
  body: 'Calls fail sometimes.',
  prUrl: 'https://github.com/o/r/pull/1',
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: parseDiff(diff),
}

const answer: ModelSummary = {
  overview: 'Adds retry.',
  goals: [
    {
      title: 'Retry failed calls',
      description: 'Calls fail sometimes.',
      changes: [{ title: 'Wrap the call', description: 'Use retry.', hunkIds: ['h1', 'h2'] }],
    },
  ],
}

describe('promptHunks', () => {
  it('lists each reviewable hunk with its ID and leaves out noise', () => {
    const text = promptHunks(source.files)

    expect(text).toContain('[h1] src/retry.ts')
    expect(text).toContain('+export const backoff = 2')
    expect(text).toContain('[h2] src/client.ts')
    expect(text).not.toContain('package-lock.json')
    expect(text).not.toContain('h3')
  })

  it('names binary files without hunks', () => {
    expect(promptHunks(source.files)).toContain('Binary file changed: logo.png')
  })
})

describe('choosePlan', () => {
  it('uses one pass when the hunks fit in the token budget', () => {
    expect(choosePlan(source.files, 100_000)).toBe('single')
  })

  it('uses map-reduce when the hunks do not fit', () => {
    expect(choosePlan(source.files, 10)).toBe('map-reduce')
  })
})

describe('summarize', () => {
  it('streams partial goals and returns a summary that covers every hunk', async () => {
    const model = new MockLanguageModelV4({ doStream: async () => streamJson(JSON.stringify(answer)) })
    const partialTitles: string[] = []

    const summary = await summarize(source, {
      model,
      onPartial: (p) => partialTitles.push(p.goals?.[0]?.title ?? ''),
    })

    expect(summary.goals.map((g) => g.title)).toEqual(['Retry failed calls', 'Generated & lockfiles'])
    expect(partialTitles.some((t) => t.length > 0 && t !== 'Retry failed calls')).toBe(true)
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain('Calls fail sometimes.')
  })

  it('summarizes each file first when the hunks do not fit, then groups the file summaries', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        const file = JSON.stringify(options.prompt).includes('src/retry.ts') ? 'retry' : 'client'
        return generateJson({
          summary: `${file} summary`,
          hunks: [{ id: file === 'retry' ? 'h1' : 'h2', what: `${file} hunk` }],
        })
      },
      doStream: async () => streamJson(JSON.stringify(answer)),
    })

    const summary = await summarize(source, { model, tokenBudget: 10 })

    expect(model.doGenerateCalls).toHaveLength(2)
    const reducePrompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(reducePrompt).toContain('retry summary')
    expect(reducePrompt).toContain('[h2] client hunk')
    expect(summary.goals[0]!.changes[0]!.hunkIds).toEqual(['h1', 'h2'])
  })
})
