/**
 * A short form of a tool path. Without `cwd`, it removes the folder of a spiffy-diff workspace.
 */
export function shortPath(path: string, cwd?: string): string {
  if (cwd && (path === cwd || path.startsWith(`${cwd}/`))) return path.slice(cwd.length + 1) || '.'
  const inWorkspace = path.match(/\/\.spiffy(?:-diff)?\/(?:worktrees|repos)\/[^/]+\/(.*)$/)
  return inWorkspace ? inWorkspace[1]! || '.' : path
}

/** A short line that tells what a tool call of the agent does. */
export function describeTool(name: string, input: unknown, cwd?: string): string | null {
  const i = (input ?? {}) as Record<string, unknown>
  const raw =
    typeof i['file_path'] === 'string'
      ? i['file_path']
      : typeof i['path'] === 'string'
        ? i['path']
        : null
  const path = raw ? shortPath(raw, cwd) : null
  if (name === 'Read' && path) return `Reading ${path}`
  if (name === 'Grep' && typeof i['pattern'] === 'string') return `Searching for ${i['pattern']}`
  if (name === 'Glob' && typeof i['pattern'] === 'string') return `Finding files: ${i['pattern']}`
  return null
}
