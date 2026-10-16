import { describe, expect, it } from 'vitest'
import { describeTool, shortPath } from './tool-activity'

describe('shortPath', () => {
  it('makes a path relative to the working directory', () => {
    expect(shortPath('/ws/src/a.ts', '/ws')).toBe('src/a.ts')
    expect(shortPath('/ws', '/ws')).toBe('.')
  })

  it('removes the workspace folder when there is no working directory', () => {
    expect(shortPath('/Users/me/.spiffy/worktrees/o__r-abc/src/a.ts')).toBe('src/a.ts')
    expect(shortPath('/Users/me/.spiffy-diff/worktrees/o__r-abc/src/a.ts')).toBe('src/a.ts')
    expect(shortPath('/other/src/a.ts')).toBe('/other/src/a.ts')
  })
})

describe('describeTool', () => {
  it('tells what Read, Grep and Glob do', () => {
    expect(describeTool('Read', { file_path: '/ws/a.py' }, '/ws')).toBe('Reading a.py')
    expect(describeTool('Grep', { pattern: 'x|y' })).toBe('Searching for x|y')
    expect(describeTool('Glob', { pattern: '**/*.py' })).toBe('Finding files: **/*.py')
    expect(describeTool('Bash', { command: 'ls' })).toBeNull()
  })
})
