import type { DiffFile } from '@shared/diff'

export type TreeNode =
  | { kind: 'dir'; name: string; path: string; children: TreeNode[] }
  | { kind: 'file'; name: string; file: DiffFile }

type Dir = Extract<TreeNode, { kind: 'dir' }>

/**
 * Puts the files in a folder tree. Folders come before files, and each level is in name order.
 * A folder that has only one folder in it joins that folder in one row ("src/lib").
 */
export function fileTree(files: DiffFile[]): TreeNode[] {
  const root: Dir = { kind: 'dir', name: '', path: '', children: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let dir = root
    parts.slice(0, -1).forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/')
      let next = dir.children.find((c): c is Dir => c.kind === 'dir' && c.path === path)
      if (!next) {
        next = { kind: 'dir', name, path, children: [] }
        dir.children.push(next)
      }
      dir = next
    })
    dir.children.push({ kind: 'file', name: parts.at(-1)!, file })
  }
  return tidy(root.children)
}

function tidy(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => {
      if (n.kind === 'file') return n
      let dir = n
      while (dir.children.length === 1 && dir.children[0]!.kind === 'dir') {
        const only = dir.children[0]
        dir = { ...only, name: `${dir.name}/${only.name}` }
      }
      return { ...dir, children: tidy(dir.children) }
    })
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

/** The file paths in the order that the tree shows them. */
export function treeOrder(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === 'file' ? [n.file.path] : treeOrder(n.children)))
}
