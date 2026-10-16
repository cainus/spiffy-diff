import type { DiffFile, Hunk } from '@shared/diff'

export function indexHunks(files: DiffFile[]): Map<string, Hunk> {
  return new Map(files.flatMap((f) => f.hunks.map((h) => [h.id, h] as const)))
}

export interface LineStats {
  additions: number
  deletions: number
  files: number
}

export function lineStats(hunkIds: string[], index: Map<string, Hunk>): LineStats {
  const hunks = hunkIds.flatMap((id) => index.get(id) ?? [])
  return {
    additions: hunks.reduce((n, h) => n + h.additions, 0),
    deletions: hunks.reduce((n, h) => n + h.deletions, 0),
    files: new Set(hunks.map((h) => h.path)).size,
  }
}

export interface FileGroup {
  file: DiffFile
  hunkIds: string[]
}

export function groupByFile(hunkIds: string[], files: DiffFile[]): FileGroup[] {
  const wanted = new Set(hunkIds)
  return files
    .map((file) => ({ file, hunkIds: file.hunks.map((h) => h.id).filter((id) => wanted.has(id)) }))
    .filter((g) => g.hunkIds.length > 0)
}
