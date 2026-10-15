import { describe, expect, it } from 'vitest'
import { claudeSettings, codexSettings, pickCodexModel } from './backends'

describe('claudeSettings', () => {
  it('runs in the workspace with read-only tools and without user settings or MCP servers', () => {
    const s = claudeSettings('/ws')

    expect(s.cwd).toBe('/ws')
    expect(s.allowedTools).toEqual(['Read', 'Grep', 'Glob', 'LS'])
    expect(s.disallowedTools).toEqual(expect.arrayContaining(['Write', 'Edit', 'Bash', 'NotebookEdit', 'WebFetch']))
    expect(s.settingSources).toEqual([])
    expect(s.mcpServers).toEqual({})
  })
})

describe('codexSettings', () => {
  it('runs in the workspace in a read-only sandbox that never asks for approval', () => {
    expect(codexSettings('/ws')).toMatchObject({
      cwd: '/ws',
      sandboxMode: 'read-only',
      approvalMode: 'never',
      skipGitRepoCheck: true,
    })
  })
})

describe('pickCodexModel', () => {
  it('uses the model that Codex marks as default', () => {
    expect(pickCodexModel([{ id: 'a', isDefault: false }, { id: 'b', isDefault: true }])).toBe('b')
  })

  it('uses the first visible model when no model is the default', () => {
    expect(pickCodexModel([{ id: 'x', hidden: true }, { id: 'y' }])).toBe('y')
  })
})
