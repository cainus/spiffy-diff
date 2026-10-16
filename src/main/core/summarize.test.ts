import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { ModelSummary } from '@shared/summary'
import type { LoadedSource } from '@shared/source'
import type { SummaryProgress } from '@shared/progress'
import { choosePlan, promptHunks, summarize } from './summarize'
import { generateJson, investigationStream, streamJson } from './test-streams'

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
  hunkNotes: [
    { hunkId: 'h1', note: 'Adds a backoff.' },
    { hunkId: 'h2', note: 'Calls retry.' },
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

  it('reports real progress: each step of the agent while it reads, then the hunks that get a change', async () => {
    let call = 0
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0
          ? investigationStream(['/ws/src/client.ts', '/ws/README.md', '/ws/lib/other.py'], 'notes')
          : streamJson(JSON.stringify(answer)),
    })
    const events: SummaryProgress[] = []

    await summarize(source, {
      model,
      cwd: '/ws',
      investigate: true,
      onProgress: (p) => events.push(p),
    })

    const reading = events.filter((e) => e.phase === 'reading')
    expect(reading.map((e) => [e.done, e.activity])).toEqual([
      [0, undefined],
      [1, 'Reading src/client.ts'],
      [2, 'Reading README.md'],
      [3, 'Reading lib/other.py'],
      [3, 'Writing the findings'],
    ])
    const summarizing = events.filter((e) => e.phase === 'summarizing')
    expect(summarizing.at(-1)).toMatchObject({ done: 2, total: 2 })
    expect(summarizing.every((e, i) => i === 0 || e.done >= summarizing[i - 1]!.done)).toBe(true)
    expect(events.at(-1)).toMatchObject({ phase: 'noting', done: 2, total: 2 })
    expect(events.every((e) => e.plan === 'single')).toBe(true)
  })

  it('tells when the agent stops its steps and writes the findings', async () => {
    let call = 0
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0
          ? investigationStream(['/ws/src/client.ts'], 'FINDING: x')
          : streamJson(JSON.stringify(answer)),
    })
    const events: SummaryProgress[] = []

    await summarize(source, {
      model,
      cwd: '/ws',
      investigate: true,
      onProgress: (p) => events.push(p),
    })

    const reading = events.filter((e) => e.phase === 'reading')
    expect(reading.at(-1)).toEqual({
      plan: 'single',
      phase: 'reading',
      done: 1,
      total: 0,
      activity: 'Writing the findings',
    })
  })

  it('counts the hunk notes after it places the hunks', async () => {
    const withNotes = {
      ...answer,
      hunkNotes: [
        { hunkId: 'h1', note: 'One.' },
        { hunkId: 'h2', note: 'Two.' },
      ],
    }
    const model = new MockLanguageModelV4({
      doStream: async () => streamJson(JSON.stringify(withNotes)),
    })
    const events: SummaryProgress[] = []

    await summarize(source, { model, onProgress: (p) => events.push(p) })

    const noting = events.filter((e) => e.phase === 'noting')
    expect(noting.map((e) => e.done)).toContain(2)
    expect(events.findIndex((e) => e.phase === 'noting')).toBeGreaterThan(
      events.findLastIndex((e) => e.phase === 'summarizing'),
    )
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
      doStream: async () => streamJson(JSON.stringify({ ...answer, hunkNotes: undefined })),
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

  describe('missing hunk notes', () => {
    const withoutH2 = { ...answer, hunkNotes: [{ hunkId: 'h1', note: 'Adds a backoff.' }] }

    it('asks for the notes of the hunks that the summary left without a note, one file at a time', async () => {
      const model = new MockLanguageModelV4({
        doStream: async () => streamJson(JSON.stringify(withoutH2)),
        doGenerate: async () =>
          generateJson({
            summary: 'The client retries.',
            hunks: [{ id: 'h2', what: 'Wraps the call in retry.' }],
          }),
      })

      const summary = await summarize(source, { model })

      expect(summary.hunkNotes).toEqual({ h1: 'Adds a backoff.', h2: 'Wraps the call in retry.' })
      expect(model.doGenerateCalls).toHaveLength(1)
      const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt)
      expect(prompt).toContain('[h2] src/client.ts')
      expect(prompt).not.toContain('[h1]')
    })

    it('does not ask again when every hunk has a note', async () => {
      const model = new MockLanguageModelV4({
        doStream: async () => streamJson(JSON.stringify(answer)),
      })

      await summarize(source, { model })

      expect(model.doGenerateCalls).toHaveLength(0)
    })

    it('keeps a summary that comes without any notes, and writes the notes', async () => {
      const model = new MockLanguageModelV4({
        doStream: async () => streamJson(JSON.stringify({ ...answer, hunkNotes: undefined })),
        doGenerate: async (options) => {
          const h = JSON.stringify(options.prompt).includes('src/retry.ts') ? 'h1' : 'h2'
          return generateJson({ summary: 's', hunks: [{ id: h, what: `note ${h}` }] })
        },
      })

      const summary = await summarize(source, { model })

      expect(summary.hunkNotes).toEqual({ h1: 'note h1', h2: 'note h2' })
    })

    it('requires the notes from the model in one pass, but not in map-reduce, where the file pass writes them', async () => {
      const single = new MockLanguageModelV4({
        doStream: async () => streamJson(JSON.stringify(answer)),
      })
      await summarize(source, { model: single })
      const reduce = new MockLanguageModelV4({
        doGenerate: async () => generateJson({ summary: 's', hunks: [] }),
        doStream: async () => streamJson(JSON.stringify(answer)),
      })
      await summarize(source, { model: reduce, tokenBudget: 10 })

      const required = (m: MockLanguageModelV4) => {
        const format = m.doStreamCalls[0]!.responseFormat as { schema?: { required?: string[] } }
        return format.schema?.required ?? []
      }
      expect(required(single)).toContain('hunkNotes')
      expect(required(reduce)).not.toContain('hunkNotes')
    })

    it('keeps the summary when the note pass fails', async () => {
      const model = new MockLanguageModelV4({
        doStream: async () => streamJson(JSON.stringify(withoutH2)),
        doGenerate: async () => Promise.reject(new Error('rate limit')),
      })

      const summary = await summarize(source, { model })

      expect(summary.goals[0]!.title).toBe('Retry failed calls')
      expect(summary.hunkNotes).toEqual({ h1: 'Adds a backoff.' })
    })
  })
})
