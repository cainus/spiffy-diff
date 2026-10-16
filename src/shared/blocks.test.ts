import { describe, expect, it } from 'vitest'
import { parseDiff } from './diff'
import { blockAt, hunkBlocks } from './blocks'

const [file] = parseDiff(`diff --git a/a.py b/a.py
--- a/a.py
+++ b/a.py
@@ -10,6 +10,7 @@ def f():
 keep = 1
-old_a = 1
-old_b = 2
+new_a = 1
 middle = 3
+added = 4
+added2 = 5
-gone = 6
 tail = 7
`)
const hunk = file!.hunks[0]!

describe('hunkBlocks', () => {
  it('splits a hunk into runs of deleted lines and runs of added lines, with their line numbers', () => {
    expect(hunkBlocks(hunk)).toEqual([
      {
        id: `${hunk.id}.b1`,
        hunkId: hunk.id,
        kind: 'before',
        from: 11,
        to: 12,
        text: 'old_a = 1\nold_b = 2',
      },
      { id: `${hunk.id}.b2`, hunkId: hunk.id, kind: 'now', from: 11, to: 11, text: 'new_a = 1' },
      {
        id: `${hunk.id}.b3`,
        hunkId: hunk.id,
        kind: 'now',
        from: 13,
        to: 14,
        text: 'added = 4\nadded2 = 5',
      },
      { id: `${hunk.id}.b4`, hunkId: hunk.id, kind: 'before', from: 14, to: 14, text: 'gone = 6' },
    ])
  })
})

describe('blockAt', () => {
  const blocks = hunkBlocks(hunk)

  it('finds the block of a deleted line by its old line number, and of an added line by its new line number', () => {
    expect(blockAt(blocks, 'deletions', 12)?.id).toBe(`${hunk.id}.b1`)
    expect(blockAt(blocks, 'additions', 14)?.id).toBe(`${hunk.id}.b3`)
    expect(blockAt(blocks, 'deletions', 14)?.id).toBe(`${hunk.id}.b4`)
  })

  it('finds no block for a context line', () => {
    expect(blockAt(blocks, 'additions', 12)).toBeNull()
    expect(blockAt(blocks, 'deletions', 10)).toBeNull()
  })
})
