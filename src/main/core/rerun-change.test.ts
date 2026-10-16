import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import { applyRerun, type RerunEvent } from '@shared/rerun'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { rerunChange } from './rerun-change'
import { generateJson, investigationStream } from './test-streams'

const diff = `diff --git a/src/retry.ts b/src/retry.ts
--- a/src/retry.ts
+++ b/src/retry.ts
@@ -1 +1,2 @@
 export const tries = 1
+export const backoff = 2
diff --git a/src/client.ts b/src/client.ts
--- a/src/client.ts
+++ b/src/client.ts
@@ -1 +1,2 @@
 export const client = 1
+export const timeout = 5
`

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 'Add retry',
  body: '',
  prUrl: null,
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: parseDiff(diff),
}

const summary: Summary = {
  overview: 'Adds retry.',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'Retry failed calls',
      description: 'Calls fail.',
      changes: [
        { id: 'g1.c1', title: 'Old title', description: 'Old text.', hunkIds: ['h1'] },
        { id: 'g1.c2', title: 'Client', description: 'Other.', hunkIds: ['h2'] },
      ],
    },
  ],
  hunkNotes: { h1: 'Old note.', h2: 'Client note.' },
}

async function collect(events: AsyncIterable<RerunEvent>): Promise<RerunEvent[]> {
  const out: RerunEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('rerunChange', () => {
  it('reads the code for one change, tells what it reads, then writes the change, the why notes, and the block notes', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => investigationStream(['/ws/src/retry.ts'], 'FINDING: backoff waits.'),
      doGenerate: async () =>
        generateJson({
          title: 'Add a backoff',
          description: 'The retry waits between tries.',
          kind: 'internal',
          hunks: [
            {
              hunkId: 'h1',
              why: 'Calls failed in bursts, so the retry must wait.',
              blocks: [{ blockId: 'h1.b1', text: 'Sets the wait time to 2 seconds.' }],
            },
          ],
        }),
    })

    const events = await collect(
      rerunChange({
        model,
        cwd: '/ws',
        source,
        summary,
        goalId: 'g1',
        changeId: 'g1.c1',
        mode: 'rerun',
      }),
    )

    expect(events).toEqual([
      { type: 'activity', text: 'Reading src/retry.ts' },
      { type: 'activity', text: 'Writing the change' },
      {
        type: 'done',
        title: 'Add a backoff',
        description: 'The retry waits between tries.',
        kind: 'internal',
        hunkNotes: { h1: 'Calls failed in bursts, so the retry must wait.' },
        blockNotes: { 'h1.b1': 'Sets the wait time to 2 seconds.' },
      },
    ])
    const look = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(look).toContain('[h1] src/retry.ts')
    expect(look).toContain('[h1.b1 NOW]')
    expect(look).not.toContain('[h2]')
    expect(look).toContain('Old title')
    const write = JSON.stringify(model.doGenerateCalls[0]!.prompt)
    expect(write).toContain('FINDING: backoff waits.')
    expect(write).toContain('why')
  })

  it('in detail mode, keeps the title and the description and asks only for the notes', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => investigationStream([], 'notes'),
      doGenerate: async () =>
        generateJson({
          hunks: [{ hunkId: 'h1', why: 'Why.', blocks: [{ blockId: 'h1.b1', text: 'Now.' }] }],
        }),
    })

    const events = await collect(
      rerunChange({
        model,
        cwd: '/ws',
        source,
        summary,
        goalId: 'g1',
        changeId: 'g1.c1',
        mode: 'detail',
      }),
    )

    expect(events.at(-1)).toEqual({
      type: 'done',
      hunkNotes: { h1: 'Why.' },
      blockNotes: { 'h1.b1': 'Now.' },
    })
    const format = model.doGenerateCalls[0]!.responseFormat as { schema?: { properties?: object } }
    expect(Object.keys(format.schema?.properties ?? {})).toEqual(['hunks'])
  })

  it('keeps only the notes of the hunks and blocks of the change', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => investigationStream([], 'notes'),
      doGenerate: async () =>
        generateJson({
          hunks: [
            {
              hunkId: 'h1',
              why: 'Mine.',
              blocks: [
                { blockId: 'h1.b1', text: 'Mine.' },
                { blockId: 'h2.b1', text: 'No.' },
              ],
            },
            { hunkId: 'h2', why: 'Not mine.', blocks: [] },
          ],
        }),
    })

    const events = await collect(
      rerunChange({
        model,
        cwd: '/ws',
        source,
        summary,
        goalId: 'g1',
        changeId: 'g1.c1',
        mode: 'detail',
      }),
    )

    expect(events.at(-1)).toEqual({
      type: 'done',
      hunkNotes: { h1: 'Mine.' },
      blockNotes: { 'h1.b1': 'Mine.' },
    })
  })

  it('rejects a change that is not in the summary', async () => {
    const model = new MockLanguageModelV4({})
    await expect(
      collect(
        rerunChange({
          model,
          cwd: '/ws',
          source,
          summary,
          goalId: 'g1',
          changeId: 'g1.c9',
          mode: 'detail',
        }),
      ),
    ).rejects.toThrow('g1.c9')
  })
})

describe('applyRerun', () => {
  it('replaces the text and the notes of one change, and marks the change as explained', () => {
    const next = applyRerun(summary, 'g1', 'g1.c1', {
      type: 'done',
      title: 'New',
      description: 'New text.',
      kind: 'refactor',
      hunkNotes: { h1: 'New note.' },
      blockNotes: { 'h1.b1': 'Block.' },
    })

    expect(next.goals[0]!.changes[0]).toEqual({
      id: 'g1.c1',
      title: 'New',
      description: 'New text.',
      hunkIds: ['h1'],
    })
    expect(next.goals[0]!.changes[1]).toEqual(summary.goals[0]!.changes[1])
    expect(next.hunkNotes).toEqual({ h1: 'New note.', h2: 'Client note.' })
    expect(next.blockNotes).toEqual({ 'h1.b1': 'Block.' })
    expect(next.detailed).toEqual(['g1.c1'])
    expect(summary.goals[0]!.changes[0]!.title).toBe('Old title')
  })

  it('keeps the title and the description when the result has none', () => {
    const next = applyRerun(summary, 'g1', 'g1.c1', { type: 'done', hunkNotes: {}, blockNotes: {} })

    expect(next.goals[0]!.changes[0]!.title).toBe('Old title')
    expect(next.goals[0]!.changes[0]!.description).toBe('Old text.')
  })
})
