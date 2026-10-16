import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The app was called "spiffy". Electron keeps local storage (the last source, the backend) in a
 * profile folder with the app name. Copy the old local storage one time. Do not copy the caches:
 * the old app can be open, and a copy of its live GPU caches stops the window from opening.
 */
export function copyOldProfile(oldDir: string, newDir: string): boolean {
  const from = join(oldDir, 'Local Storage')
  const to = join(newDir, 'Local Storage')
  // Electron can make the new profile folder before this runs, so test the local storage folder.
  if (existsSync(to) || !existsSync(from)) return false
  cpSync(from, to, { recursive: true })
  return true
}
