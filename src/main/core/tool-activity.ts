import { relative } from 'node:path'

/** A short line that tells what a tool call of the agent does. Paths are relative to `cwd`. */
export function describeTool(name: string, input: unknown, cwd?: string): string | null {
  const i = (input ?? {}) as Record<string, unknown>
  const raw =
    typeof i['file_path'] === 'string'
      ? i['file_path']
      : typeof i['path'] === 'string'
        ? i['path']
        : null
  const path = raw && cwd && raw.startsWith(cwd) ? relative(cwd, raw) || '.' : raw
  if (name === 'Read' && path) return `Reading ${path}`
  if (name === 'Grep' && typeof i['pattern'] === 'string') return `Searching for ${i['pattern']}`
  if (name === 'Glob' && typeof i['pattern'] === 'string') return `Finding files: ${i['pattern']}`
  return null
}
