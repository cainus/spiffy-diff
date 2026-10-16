import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { LanguageModel } from 'ai'
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code'
import { codexCli, listModels, type CodexCliSettings } from 'ai-sdk-provider-codex-cli'
import type { Backend } from '@shared/source'
import { STE_RULES } from './style'

export type Purpose = 'summary' | 'chat'

const READ_TOOLS = ['Read', 'Grep', 'Glob']

/** Replaces the Claude Code preset, which is for an agent that edits code. */
const REVIEWER_PROMPT = `You help a reviewer understand code changes. You cannot change files.

${STE_RULES}`

/**
 * The agent is read-only. See PLAN.md decision 5.
 * `tools` is the full tool set, so no write tool exists.
 * The summary pass gets no tools: with tools, Claude can answer in more than one turn,
 * and the provider joins the turns into text that is not one JSON object.
 */
export function claudeSettings(
  cwd: string,
  purpose: Purpose,
  executable?: string,
): ClaudeCodeSettings {
  const tools = purpose === 'chat' ? READ_TOOLS : []
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

let codexModel: Promise<string> | undefined

/** Make the language model for a backend. The model works in `cwd`. */
export async function createModel(
  backend: Backend,
  cwd: string,
  purpose: Purpose,
): Promise<LanguageModel> {
  // Use the claude program that the user installed and logged in to. The bundled binary is the fallback.
  if (backend === 'claude')
    return claudeCode('sonnet', claudeSettings(cwd, purpose, findOnPath('claude')))
  // Use the codex program that the user installed and logged in to. The bundled copy is the fallback,
  // and it cannot start from inside a packaged app.
  const codexPath = findOnPath('codex')
  codexModel ??= listModels(codexPath ? { codexPath } : {}).then((r) => pickCodexModel(r.models))
  return codexCli(await codexModel, codexSettings(cwd, codexPath))
}
