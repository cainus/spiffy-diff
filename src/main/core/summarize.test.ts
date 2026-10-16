import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { ModelSummary } from '@shared/summary'
import type { LoadedSource } from '@shared/source'
import type { SummaryProgress } from '@shared/progress'
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

function investigationStream(paths: string[], text: string) {
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
    const model = new MockLanguageModelV4({
      doStream: async () => streamJson(JSON.stringify(answer)),
    })
    const partialTitles: string[] = []

    const summary = await summarize(source, {
      model,
      onPartial: (p) => partialTitles.push(p.goals?.[0]?.title ?? ''),
    })

    expect(summary.goals.map((g) => g.title)).toEqual([
      'Retry failed calls',
      'Generated & lockfiles',
    ])
    expect(partialTitles.some((t) => t.length > 0 && t !== 'Retry failed calls')).toBe(true)
    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain('Calls fail sometimes.')
  })

  it('recovers the summary when the provider sends a broken prefix before the full JSON object', async () => {
    const full = JSON.stringify({ overview: 'Adds retry.', goals: answer.goals })
    const model = new MockLanguageModelV4({ doStream: async () => streamJson(`{"goals": ${full}`) })

    const summary = await summarize(source, { model })

    expect(summary.overview).toBe('Adds retry.')
    expect(summary.goals[0]!.title).toBe('Retry failed calls')
  })

  it('recovers the summary when the provider sends an incomplete object and then the full object', async () => {
    const partial = JSON.stringify({ goals: answer.goals })
    const full = JSON.stringify(answer)
    const model = new MockLanguageModelV4({ doStream: async () => streamJson(partial + full) })

    const summary = await summarize(source, { model })

    expect(summary.overview).toBe('Adds retry.')
  })

  it('passes on only partial summaries that have the right shape', async () => {
    const full = JSON.stringify(answer)
    const model = new MockLanguageModelV4({ doStream: async () => streamJson(`{"goals": ${full}`) })
    const partials: unknown[] = []

    await summarize(source, { model, onPartial: (p) => partials.push(p) })

    for (const p of partials) {
      expect(Array.isArray((p as { goals?: unknown }).goals ?? [])).toBe(true)
    }
  })

  it('first reads the code to find why it changed, then builds the summary from those findings', async () => {
    let call = 0
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0
          ? investigationStream([], 'FINDING: retry exists because the payment API drops calls.')
          : streamJson(JSON.stringify(answer)),
    })

    const summary = await summarize(source, { model, investigate: true })

    const investigation = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(investigation).toContain('working directory')
    expect(investigation).toContain('[h2] src/client.ts')
    const structured = JSON.stringify(model.doStreamCalls[1]!.prompt)
    expect(structured).toContain('FINDING: retry exists because the payment API drops calls.')
    expect(summary.goals[0]!.title).toBe('Retry failed calls')
  })

  it('reports real progress: the changed files that the agent reads, then the hunks that get a change', async () => {
    let call = 0
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0
          ? investigationStream(
              ['/ws/src/client.ts', '/ws/src/client.ts', '/ws/README.md', '/ws/src/retry.ts'],
              'notes',
            )
          : streamJson(JSON.stringify(answer)),
    })
    const events: SummaryProgress[] = []

    await summarize(source, { model, investigate: true, onProgress: (p) => events.push(p) })

    const reading = events.filter((e) => e.phase === 'reading')
    expect(reading.map((e) => [e.done, e.total, e.file])).toEqual([
      [0, 2, undefined],
      [1, 2, 'src/client.ts'],
      [2, 2, 'src/retry.ts'],
    ])
    const summarizing = events.filter((e) => e.phase === 'summarizing')
    expect(summarizing.at(-1)).toMatchObject({ done: 2, total: 2 })
    expect(summarizing.every((e, i) => i === 0 || e.done >= summarizing[i - 1]!.done)).toBe(true)
    expect(events.every((e) => e.plan === 'single')).toBe(true)
  })

  it('asks the model for one note for each hunk', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () =>
        streamJson(
          JSON.stringify({
            ...answer,
            hunkNotes: [{ hunkId: 'h2', note: 'The client calls retry.' }],
          }),
        ),
    })

    const summary = await summarize(source, { model })

    expect(JSON.stringify(model.doStreamCalls[0]!.prompt)).toContain('one note for each hunk')
    expect(summary.hunkNotes).toEqual({ h2: 'The client calls retry.' })
  })

  it('tells the model to write in ASD-STE100', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => streamJson(JSON.stringify(answer)),
    })

    await summarize(source, { model })

    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(prompt).toContain('ASD-STE100')
    expect(prompt).toContain('active voice')
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

    const events: SummaryProgress[] = []
    const summary = await summarize(source, {
      model,
      tokenBudget: 10,
      onProgress: (p) => events.push(p),
    })

    expect(events.filter((e) => e.phase === 'digesting').map((e) => [e.done, e.total])).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])

    expect(model.doGenerateCalls).toHaveLength(2)
    const reducePrompt = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(reducePrompt).toContain('retry summary')
    expect(reducePrompt).toContain('[h2] client hunk')
    expect(summary.goals[0]!.changes[0]!.hunkIds).toEqual(['h1', 'h2'])
    expect(summary.hunkNotes).toEqual({ h1: 'retry hunk', h2: 'client hunk' })
  })
})
