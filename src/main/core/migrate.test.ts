import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyOldProfile } from './migrate'

async function dirs() {
  const root = await mkdtemp(join(tmpdir(), 'migrate-'))
  return { old: join(root, 'spiffy'), now: join(root, 'spiffy-diff') }
}

describe('copyOldProfile', () => {
  it('copies the local storage of the old app name, and not the caches', async () => {
    const { old, now } = await dirs()
    await mkdir(join(old, 'Local Storage'), { recursive: true })
    await writeFile(join(old, 'Local Storage', 'data'), 'last source')
    await mkdir(join(old, 'GPUCache'), { recursive: true })

    expect(copyOldProfile(old, now)).toBe(true)

    expect(await readFile(join(now, 'Local Storage', 'data'), 'utf8')).toBe('last source')
    expect(existsSync(join(now, 'GPUCache'))).toBe(false)
    expect(existsSync(old)).toBe(true)
  })

  it('copies into a new profile folder that Electron made already, but not over its local storage', async () => {
    const { old, now } = await dirs()
    await mkdir(join(old, 'Local Storage'), { recursive: true })
    await writeFile(join(old, 'Local Storage', 'data'), 'old')
    await mkdir(now, { recursive: true })

    expect(copyOldProfile(old, now)).toBe(true)
    await writeFile(join(now, 'Local Storage', 'data'), 'new')

    expect(copyOldProfile(old, now)).toBe(false)
    expect(await readFile(join(now, 'Local Storage', 'data'), 'utf8')).toBe('new')
  })

  it('does nothing when there is no old profile', async () => {
    const { old, now } = await dirs()
    expect(copyOldProfile(old, now)).toBe(false)
    expect(existsSync(now)).toBe(false)
  })
})
