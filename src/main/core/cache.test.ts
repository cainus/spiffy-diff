import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Summary } from '@shared/summary'
import { readCachedSummary, writeCachedSummary } from './cache'

const summary: Summary = { overview: 'o', goals: [] }

describe('summary cache', () => {
  it('returns null when there is no summary for the key', async () => {
    const home = mkdtempSync(join(tmpdir(), 'spiffy-cache-'))

    expect(await readCachedSummary(home, 'k')).toBeNull()
  })

  it('returns the summary that was written for the key', async () => {
    const home = mkdtempSync(join(tmpdir(), 'spiffy-cache-'))

    await writeCachedSummary(home, 'k', summary)

    expect(await readCachedSummary(home, 'k')).toEqual(summary)
  })
})
