import { describe, expect, it } from 'vitest'
import { parseDiff } from '@shared/diff'
import { groupByFile, indexHunks, lineStats } from './stats'

const files = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1,2 @@
-a
+A
+B
@@ -9 +10 @@
-x
+X
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +0,0 @@
-gone
`)

describe('lineStats', () => {
  it('adds the added and removed lines of the hunks', () => {
    expect(lineStats(['h1', 'h3'], indexHunks(files))).toEqual({
      additions: 2,
      deletions: 2,
      files: 2,
    })
  })
})

describe('groupByFile', () => {
  it('groups hunk IDs by file in diff order', () => {
    expect(groupByFile(['h3', 'h1', 'h2'], files).map((g) => [g.file.path, g.hunkIds])).toEqual([
      ['a.ts', ['h1', 'h2']],
      ['b.ts', ['h3']],
    ])
  })
})
