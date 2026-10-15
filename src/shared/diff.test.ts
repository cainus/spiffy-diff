import { describe, expect, it } from 'vitest'
import { filePatch, parseDiff } from './diff'

const oneHunk = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@ export function a() {
 const x = 1
-const y = 2
+const y = 3
 const z = 4
`

describe('parseDiff', () => {
  it('parses one file with one hunk and gives the hunk the ID h1', () => {
    const files = parseDiff(oneHunk)

    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ path: 'src/a.ts', oldPath: 'src/a.ts', status: 'modified' })
    expect(files[0]!.hunks).toEqual([
      {
        id: 'h1',
        path: 'src/a.ts',
        header: '@@ -1,3 +1,3 @@ export function a() {',
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 3,
        additions: 1,
        deletions: 1,
        patch:
          '@@ -1,3 +1,3 @@ export function a() {\n const x = 1\n-const y = 2\n+const y = 3\n const z = 4',
      },
    ])
  })

  it('detects added, deleted, and renamed files', () => {
    const files = parseDiff(`diff --git a/new.ts b/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+export const n = 1
diff --git a/old.ts b/old.ts
deleted file mode 100644
index 1111111..0000000
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const o = 1
diff --git a/from.ts b/to.ts
similarity index 90%
rename from from.ts
rename to to.ts
`)

    expect(files.map((f) => [f.oldPath, f.path, f.status])).toEqual([
      ['new.ts', 'new.ts', 'added'],
      ['old.ts', 'old.ts', 'deleted'],
      ['from.ts', 'to.ts', 'renamed'],
    ])
  })

  it('marks binary files and gives them no hunks', () => {
    const files = parseDiff(`diff --git a/logo.png b/logo.png
index 1111111..2222222 100644
Binary files a/logo.png and b/logo.png differ
`)

    expect(files[0]).toMatchObject({ path: 'logo.png', binary: true, hunks: [] })
  })

  it('keeps an empty context line inside a hunk when its trailing space was stripped', () => {
    const files = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 one

-two
+TWO
`)

    expect(files[0]!.hunks[0]!.patch).toBe('@@ -1,3 +1,3 @@\n one\n\n-two\n+TWO')
  })

  it('gives hunk IDs in diff order across files', () => {
    const files = parseDiff(oneHunk + oneHunk.replaceAll('src/a.ts', 'src/b.ts'))

    expect(files.flatMap((f) => f.hunks.map((h) => `${h.path}:${h.id}`))).toEqual([
      'src/a.ts:h1',
      'src/b.ts:h2',
    ])
  })
})

describe('filePatch', () => {
  const two = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-one
+ONE
@@ -9 +9 @@
-nine
+NINE
`

  it('builds a patch for the whole file with file headers', () => {
    const [file] = parseDiff(two)

    expect(filePatch(file!)).toBe(
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-one\n+ONE\n@@ -9 +9 @@\n-nine\n+NINE\n',
    )
  })

  it('builds a patch for only some hunks', () => {
    const [file] = parseDiff(two)

    expect(filePatch(file!, ['h2'])).toBe(
      'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -9 +9 @@\n-nine\n+NINE\n',
    )
  })

  it('uses /dev/null for the missing side of added and deleted files', () => {
    const [added] = parseDiff(`diff --git a/n.ts b/n.ts
new file mode 100644
--- /dev/null
+++ b/n.ts
@@ -0,0 +1 @@
+n
`)

    expect(filePatch(added!)).toContain('--- /dev/null\n+++ b/n.ts\n')
  })
})
