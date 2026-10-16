import type { LanguageModel } from 'ai'
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code'
import { codexCli, listModels, type CodexCliSettings } from 'ai-sdk-provider-codex-cli'
import type { Backend } from '@shared/source'

export type Purpose = 'summary' | 'chat'

const READ_TOOLS = ['Read', 'Grep', 'Glob']

/**
 * The agent is read-only. See PLAN.md decision 5.
 * `tools` is the full tool set, so no write tool exists.
 * The summary pass gets no tools: with tools, Claude can answer in more than one turn,
 * and the provider joins the turns into text that is not one JSON object.
 */
export function claudeSettings(cwd: string, purpose: Purpose): ClaudeCodeSettings {
  const tools = purpose === 'chat' ? READ_TOOLS : []
  return {
    cwd,
    permissionMode: 'default',
    tools,
    allowedTools: tools,
    settingSources: [],
    mcpServers: {},
  }
}

export function codexSettings(cwd: string): CodexCliSettings {
  return { cwd, sandboxMode: 'read-only', approvalMode: 'never', skipGitRepoCheck: true }
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
  if (backend === 'claude') return claudeCode('sonnet', claudeSettings(cwd, purpose))
  codexModel ??= listModels().then((r) => pickCodexModel(r.models))
  return codexCli(await codexModel, codexSettings(cwd))
}
