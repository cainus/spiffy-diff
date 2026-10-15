import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Summary } from '@shared/summary'

function file(home: string, key: string): string {
  return join(home, 'summaries', `${key}.json`)
}

export async function readCachedSummary(home: string, key: string): Promise<Summary | null> {
  try {
    return JSON.parse(await readFile(file(home, key), 'utf8')) as Summary
  } catch {
    return null
  }
}

export async function writeCachedSummary(home: string, key: string, summary: Summary): Promise<void> {
  await mkdir(join(home, 'summaries'), { recursive: true })
  await writeFile(file(home, key), JSON.stringify(summary))
}
