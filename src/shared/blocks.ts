import type { Hunk } from './diff'

/** A run of deleted lines (`before`) or added lines (`now`) in a hunk. */
export interface Block {
  /** For example `h3.b2`. */
  id: string
  hunkId: string
  kind: 'before' | 'now'
  /** The first and last line numbers: old numbers for `before`, new numbers for `now`. */
  from: number
  to: number
  /** The code of the lines, without the + and - signs. */
  text: string
}

/** Split a hunk into its blocks of deleted lines and added lines. */
export function hunkBlocks(hunk: Hunk): Block[] {
  const blocks: Block[] = []
  let oldLine = hunk.oldStart
  let newLine = hunk.newStart
  let open: Block | null = null
  let lines: string[] = []
  for (const line of [...hunk.patch.split('\n').slice(1), ' ']) {
    const sign = line[0]
    if (sign === '\\') continue
    const kind: Block['kind'] | null = sign === '-' ? 'before' : sign === '+' ? 'now' : null
    if (open && kind !== open.kind) {
      blocks.push({ ...open, text: lines.join('\n') })
      open = null
      lines = []
    }
    if (kind) {
      const at: number = kind === 'before' ? oldLine : newLine
      open ??= {
        id: `${hunk.id}.b${blocks.length + 1}`,
        hunkId: hunk.id,
        kind,
        from: at,
        to: at,
        text: '',
      }
      open.to = at
      lines.push(line.slice(1))
    }
    if (sign !== '+') oldLine++
    if (sign !== '-') newLine++
  }
  return blocks
}

/** The block of a diff line. Deleted lines use old line numbers, added lines use new line numbers. */
export function blockAt(
  blocks: Block[],
  side: 'deletions' | 'additions',
  lineNumber: number,
): Block | null {
  const kind = side === 'deletions' ? 'before' : 'now'
  return blocks.find((b) => b.kind === kind && lineNumber >= b.from && lineNumber <= b.to) ?? null
}
