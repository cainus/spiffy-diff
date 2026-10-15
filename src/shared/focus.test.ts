import { describe, expect, it } from 'vitest'
import { parseDiff } from './diff'
import { describeFocus, type Focus } from './focus'
import type { Summary } from './summary'

const files = parseDiff(`diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-call()
+retry(call)
`)

const summary: Summary = {
  overview: 'Adds retry.',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'Retry failed calls',
      description: 'Calls fail.',
      changes: [
        { id: 'g1.c1', title: 'Wrap the call', description: 'Use retry.', hunkIds: ['h1'] },
      ],
    },
  ],
}

describe('describeFocus', () => {
  it('names the whole source at the top level', () => {
    expect(describeFocus({ level: 'source' }, summary, files)).toBe(
      'The user looks at the whole source.',
    )
  })

  it('names the goal and its description at the goal level', () => {
    const text = describeFocus({ level: 'goal', goalId: 'g1' }, summary, files)

    expect(text).toContain('goal "Retry failed calls"')
    expect(text).toContain('Calls fail.')
  })

  it('includes the code of the change at the change level', () => {
    const text = describeFocus({ level: 'change', goalId: 'g1', changeId: 'g1.c1' }, summary, files)

    expect(text).toContain('change "Wrap the call"')
    expect(text).toContain('in the goal "Retry failed calls"')
    expect(text).toContain('+retry(call)')
  })

  it('names the file in the files view', () => {
    expect(describeFocus({ level: 'file', path: 'src/a.ts' }, summary, files)).toBe(
      'The user looks at the diff of the file src/a.ts.',
    )
  })

  it('falls back to the whole source when the focus points to nothing', () => {
    const focus: Focus = { level: 'goal', goalId: 'g9' }

    expect(describeFocus(focus, summary, files)).toBe('The user looks at the whole source.')
  })
})
