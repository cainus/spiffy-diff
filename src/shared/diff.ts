type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed'

export interface Hunk {
  id: string
  path: string
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  additions: number
  deletions: number
  patch: string
}

export interface DiffFile {
  path: string
  oldPath: string
  status: FileStatus
  binary: boolean
  hunks: Hunk[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parse the output of `git diff` into files and hunks.
 * Hunk IDs are `h1`, `h2`, ... in diff order. See ADR 0002.
 */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | undefined
  let hunk: Hunk | undefined
  let lines: string[] = []
  let oldLeft = 0
  let newLeft = 0
  let nextId = 1

  const closeHunk = (): void => {
    if (!hunk) return
    hunk.patch = lines.join('\n')
    hunk = undefined
  }

  for (const line of text.split('\n')) {
    if (hunk && (oldLeft > 0 || newLeft > 0 || line.startsWith('\\'))) {
      lines.push(line)
      if (line.startsWith('+')) {
        hunk.additions++
        newLeft--
      } else if (line.startsWith('-')) {
        hunk.deletions++
        oldLeft--
      } else if (!line.startsWith('\\')) {
        oldLeft--
        newLeft--
      }
      continue
    }
    closeHunk()

    const header = HUNK_HEADER.exec(line)
    if (line.startsWith('diff --git ')) {
      const [, oldPath = '', path = ''] = /^diff --git a\/(.+) b\/(.+)$/.exec(line) ?? []
      file = { path, oldPath, status: 'modified', binary: false, hunks: [] }
      files.push(file)
    } else if (!file) {
      continue
    } else if (header) {
      hunk = {
        id: `h${nextId++}`,
        path: file.path,
        header: line,
        oldStart: Number(header[1]),
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        additions: 0,
        deletions: 0,
        patch: '',
      }
      oldLeft = hunk.oldLines
      newLeft = hunk.newLines
      lines = [line]
      file.hunks.push(hunk)
    } else if (line.startsWith('new file mode')) {
      file.status = 'added'
    } else if (line.startsWith('deleted file mode')) {
      file.status = 'deleted'
    } else if (line.startsWith('rename from ')) {
      file.status = 'renamed'
      file.oldPath = line.slice('rename from '.length)
    } else if (line.startsWith('rename to ')) {
      file.path = line.slice('rename to '.length)
    } else if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      file.binary = true
    }
  }
  closeHunk()
  return files
}

/** A patch with file headers, for the diff renderer. Give `hunkIds` to keep only some hunks. */
export function filePatch(file: DiffFile, hunkIds?: string[]): string {
  const hunks = hunkIds ? file.hunks.filter((h) => hunkIds.includes(h.id)) : file.hunks
  const oldName = file.status === 'added' ? '/dev/null' : `a/${file.oldPath}`
  const newName = file.status === 'deleted' ? '/dev/null' : `b/${file.path}`
  const header = `diff --git a/${file.oldPath} b/${file.path}\n--- ${oldName}\n+++ ${newName}\n`
  return header + hunks.map((h) => `${h.patch}\n`).join('')
}
