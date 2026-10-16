import { describe, expect, it } from 'vitest'
import { claudeSettings, codexSettings, pickCodexModel } from './backends'

describe('claudeSettings', () => {
  it('gives the chat agent only read-only tools in the workspace, without user settings or MCP servers', () => {
    const s = claudeSettings('/ws', 'chat')

    expect(s.cwd).toBe('/ws')
    expect(s.tools).toEqual(['Read', 'Grep', 'Glob'])
    expect(s.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
    expect(s.disallowedTools).toBeUndefined()
    expect(s.settingSources).toEqual([])
    expect(s.mcpServers).toEqual({})
  })

  it('replaces the Claude Code system prompt with a read-only reviewer prompt that has the STE rules', () => {
    for (const purpose of ['chat', 'summary'] as const) {
      const prompt = String(claudeSettings('/ws', purpose).systemPrompt)
      expect(prompt).toContain('ASD-STE100')
      expect(prompt).toContain('You cannot change files')
    }
  })

  it('gives the summary pass no tools, so that the answer is one JSON object', () => {
    const s = claudeSettings('/ws', 'summary')

    expect(s.tools).toEqual([])
    expect(s.allowedTools).toEqual([])
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
    expect(
      pickCodexModel([
        { id: 'a', isDefault: false },
        { id: 'b', isDefault: true },
      ]),
    ).toBe('b')
  })

  it('uses the first visible model when no model is the default', () => {
    expect(pickCodexModel([{ id: 'x', hidden: true }, { id: 'y' }])).toBe('y')
  })
})
