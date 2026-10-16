import { describe, expect, it } from 'vitest'
import {
  claudeExecutable,
  claudeSettings,
  codexSettings,
  findOnPath,
  pickCodexModel,
} from './backends'

describe('claudeSettings', () => {
  it('gives the agent only read-only tools in the workspace, for the summary and the chat, without user settings or MCP servers', () => {
    const s = claudeSettings('/ws')

    expect(s.cwd).toBe('/ws')
    expect(s.tools).toEqual(['Read', 'Grep', 'Glob'])
    expect(s.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
    expect(s.disallowedTools).toBeUndefined()
    expect(s.settingSources).toEqual([])
    expect(s.mcpServers).toEqual({})
  })

  it('replaces the Claude Code system prompt with a read-only reviewer prompt that has the STE rules', () => {
    const prompt = String(claudeSettings('/ws').systemPrompt)
    expect(prompt).toContain('ASD-STE100')
    expect(prompt).toContain('You cannot change files')
  })

  it('uses the claude program that you installed when one is given', () => {
    expect(claudeSettings('/ws', '/opt/homebrew/bin/claude').pathToClaudeCodeExecutable).toBe(
      '/opt/homebrew/bin/claude',
    )
    expect(claudeSettings('/ws').pathToClaudeCodeExecutable).toBeUndefined()
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

describe('codexSettings executable', () => {
  it('uses the codex program that you installed when one is given', () => {
    expect(codexSettings('/ws', '/Users/me/.local/bin/codex').codexPath).toBe(
      '/Users/me/.local/bin/codex',
    )
    expect(codexSettings('/ws').codexPath).toBeUndefined()
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

describe('findOnPath', () => {
  it('finds an executable file in a PATH folder', async () => {
    const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const a = mkdtempSync(join(tmpdir(), 'spiffy-path-'))
    const b = mkdtempSync(join(tmpdir(), 'spiffy-path-'))
    writeFileSync(join(b, 'claude'), '#!/bin/sh\n')
    chmodSync(join(b, 'claude'), 0o755)

    expect(findOnPath('claude', `${a}:${b}`)).toBe(join(b, 'claude'))
    expect(findOnPath('nope', `${a}:${b}`)).toBeUndefined()
  })
})

describe('claudeExecutable', () => {
  it('returns the installed claude program', async () => {
    const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'spiffy-path-'))
    writeFileSync(join(dir, 'claude'), '#!/bin/sh\n')
    chmodSync(join(dir, 'claude'), 0o755)

    expect(claudeExecutable(dir)).toBe(join(dir, 'claude'))
  })

  it('tells you to install Claude Code when it is not on the PATH', () => {
    expect(() => claudeExecutable('/nonexistent')).toThrow(
      'Spiffy cannot find Claude Code. Install it from https://claude.com/claude-code, then run `claude` one time to log in.',
    )
  })
})
