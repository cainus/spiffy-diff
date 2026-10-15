import { execFileSync } from 'node:child_process'

/**
 * An app that starts from the Finder does not get the PATH of the login shell.
 * Then `git`, `gh`, `claude`, and `codex` are not found. This copies the PATH
 * of the login shell into the process.
 */
export function applyLoginShellPath(): void {
  if (process.platform === 'win32') return
  try {
    const shell = process.env['SHELL'] ?? '/bin/zsh'
    const out = execFileSync(shell, ['-ilc', 'printf "__PATH__%s" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
    })
    const path = out.slice(out.lastIndexOf('__PATH__') + '__PATH__'.length).trim()
    if (path) process.env['PATH'] = path
  } catch {
    // Keep the PATH that the process has.
  }
}
