import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { LanguageModel } from 'ai'
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code'
import { codexCli, listModels, type CodexCliSettings } from 'ai-sdk-provider-codex-cli'
import type { Backend } from '@shared/source'
import { STE_RULES } from './style'

const READ_TOOLS = ['Read', 'Grep', 'Glob']

/** Replaces the Claude Code preset, which is for an agent that edits code. */
const REVIEWER_PROMPT = `You help a reviewer understand code changes. You cannot change files.

${STE_RULES}`

/**
 * The agent is read-only. See PLAN.md decision 5.
 * `tools` is the full tool set, so no write tool exists.
 * The summary pass and the chat both read files. With tools, Claude answers in more than one turn,
 * and the provider can join the turns into broken JSON. `summarize` recovers the last valid object.
 */
export function claudeSettings(cwd: string, executable?: string): ClaudeCodeSettings {
  const tools = READ_TOOLS
  return {
    cwd,
    permissionMode: 'default',
    systemPrompt: REVIEWER_PROMPT,
    tools,
    allowedTools: tools,
    settingSources: [],
    mcpServers: {},
    ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
  }
}

/** The full path of an executable program in the PATH folders, or undefined. */
export function findOnPath(name: string, path = process.env['PATH'] ?? ''): string | undefined {
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const file = join(dir, name)
    try {
      accessSync(file, constants.X_OK)
      return file
    } catch {
      // Not in this folder.
    }
  }
  return undefined
}

export function codexSettings(cwd: string, executable?: string): CodexCliSettings {
  return {
    cwd,
    sandboxMode: 'read-only',
    approvalMode: 'never',
    skipGitRepoCheck: true,
    ...(executable ? { codexPath: executable } : {}),
  }
}

interface CodexModelInfo {
  id: string
  isDefault?: boolean | null
  hidden?: boolean | null
}

export function pickCodexModel(models: CodexModelInfo[]): string {
  const visible = models.filter((m) => !m.hidden)
  const chosen = visible.find((m) => m.isDefault) ?? visible[0]
  if (!chosen) throw new Error('Codex reports no models. Run `codex login` and try again.')
  return chosen.id
}

/** The installed Claude Code program. spiffy-diff does not ship its own copy. */
export function claudeExecutable(path = process.env['PATH'] ?? ''): string {
  const found = findOnPath('claude', path)
  if (!found) {
    throw new Error(
      'spiffy-diff cannot find Claude Code. Install it from https://claude.com/claude-code, then run `claude` one time to log in.',
    )
  }
  return found
}

let codexModel: Promise<string> | undefined

/** Make the language model for a backend. The model works in `cwd`. */
export async function createModel(backend: Backend, cwd: string): Promise<LanguageModel> {
  if (backend === 'claude') return claudeCode('sonnet', claudeSettings(cwd, claudeExecutable()))
  // Use the codex program that the user installed and logged in to. The bundled copy is the fallback,
  // and it cannot start from inside a packaged app.
  const codexPath = findOnPath('codex')
  codexModel ??= listModels(codexPath ? { codexPath } : {}).then((r) => pickCodexModel(r.models))
  return codexCli(await codexModel, codexSettings(cwd, codexPath))
}
