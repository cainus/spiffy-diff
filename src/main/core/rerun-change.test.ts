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
  it('reads the code for one change, tells what it reads, then writes the change again', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => investigationStream(['/ws/src/retry.ts'], 'FINDING: backoff waits.'),
      doGenerate: async () =>
        generateJson({
          title: 'Add a backoff',
          description: 'The retry waits between tries.',
          hunkNotes: [{ hunkId: 'h1', note: 'Adds the backoff time.' }],
        }),
    })

    const events = await collect(
      rerunChange({ model, cwd: '/ws', source, summary, goalId: 'g1', changeId: 'g1.c1' }),
    )

    expect(events).toEqual([
      { type: 'activity', text: 'Reading src/retry.ts' },
      { type: 'activity', text: 'Writing the change' },
      {
        type: 'done',
        title: 'Add a backoff',
        description: 'The retry waits between tries.',
        hunkNotes: { h1: 'Adds the backoff time.' },
      },
    ])
    const look = JSON.stringify(model.doStreamCalls[0]!.prompt)
    expect(look).toContain('[h1] src/retry.ts')
    expect(look).not.toContain('[h2]')
    expect(look).toContain('Old title')
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain('FINDING: backoff waits.')
  })

  it('keeps only the notes of the hunks of the change', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => investigationStream([], 'notes'),
      doGenerate: async () =>
        generateJson({
          title: 't',
          description: 'd',
          hunkNotes: [
            { hunkId: 'h1', note: 'Mine.' },
            { hunkId: 'h2', note: 'Not mine.' },
          ],
        }),
    })

    const events = await collect(
      rerunChange({ model, cwd: '/ws', source, summary, goalId: 'g1', changeId: 'g1.c1' }),
    )

    const done = events.at(-1)
    expect(done?.type === 'done' && done.hunkNotes).toEqual({ h1: 'Mine.' })
  })

  it('rejects a change that is not in the summary', async () => {
    const model = new MockLanguageModelV4({})
    await expect(
      collect(rerunChange({ model, cwd: '/ws', source, summary, goalId: 'g1', changeId: 'g1.c9' })),
    ).rejects.toThrow('g1.c9')
  })
})

describe('applyRerun', () => {
  it('replaces the title, the description, and the notes of one change only', () => {
    const next = applyRerun(summary, 'g1', 'g1.c1', {
      type: 'done',
      title: 'New',
      description: 'New text.',
      hunkNotes: { h1: 'New note.' },
    })

    expect(next.goals[0]!.changes[0]).toEqual({
      id: 'g1.c1',
      title: 'New',
      description: 'New text.',
      hunkIds: ['h1'],
    })
    expect(next.goals[0]!.changes[1]).toEqual(summary.goals[0]!.changes[1])
    expect(next.hunkNotes).toEqual({ h1: 'New note.', h2: 'Client note.' })
    expect(summary.goals[0]!.changes[0]!.title).toBe('Old title')
  })
})
