import { describe, expect, it } from 'vitest'
import type { DiffFile } from '@shared/diff'
import { fileTree, treeOrder, type TreeNode } from './file-tree'

const file = (path: string): DiffFile => ({
  path,
  oldPath: path,
  status: 'modified',
  binary: false,
  hunks: [],
})

/** A short text form of the tree: folders end in "/", children are indented. */
function show(nodes: TreeNode[], depth = 0): string[] {
  return nodes.flatMap((n) => [
    '  '.repeat(depth) + (n.kind === 'dir' ? `${n.name}/` : n.name),
    ...(n.kind === 'dir' ? show(n.children, depth + 1) : []),
  ])
}

describe('fileTree', () => {
  it('puts folders before files, each level in name order', () => {
    const tree = fileTree(['README.md', 'src/b.ts', 'docs/x.md', 'src/a.ts'].map(file))
    expect(show(tree)).toEqual(['docs/', '  x.md', 'src/', '  a.ts', '  b.ts', 'README.md'])
  })

  it('joins a folder that has only one folder in it with that folder', () => {
    const tree = fileTree(
      ['src/renderer/lib/a.ts', 'src/renderer/lib/b.ts', 'src/main.ts'].map(file),
    )
    expect(show(tree)).toEqual(['src/', '  renderer/lib/', '    a.ts', '    b.ts', '  main.ts'])
    const src = tree[0] as Extract<TreeNode, { kind: 'dir' }>
    expect(src.children[0]).toMatchObject({ path: 'src/renderer/lib' })
  })

  it('does not join a folder with files beside its folder', () => {
    expect(show(fileTree(['a/b/c.ts', 'a/d.ts'].map(file)))).toEqual([
      'a/',
      '  b/',
      '    c.ts',
      '  d.ts',
    ])
  })
})

describe('treeOrder', () => {
  it('gives the file paths in the order of the tree', () => {
    const tree = fileTree(['z.ts', 'src/b.ts', 'src/a.ts'].map(file))
    expect(treeOrder(tree)).toEqual(['src/a.ts', 'src/b.ts', 'z.ts'])
  })
})
