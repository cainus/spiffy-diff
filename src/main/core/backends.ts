import type { LanguageModel } from 'ai'
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code'
import { codexCli, listModels, type CodexCliSettings } from 'ai-sdk-provider-codex-cli'
import type { Backend } from '@shared/source'

/** The agent is read-only. See PLAN.md decision 5. */
export function claudeSettings(cwd: string): ClaudeCodeSettings {
  return {
    cwd,
    permissionMode: 'default',
    allowedTools: ['Read', 'Grep', 'Glob', 'LS'],
    disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'Task'],
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
export async function createModel(backend: Backend, cwd: string): Promise<LanguageModel> {
  if (backend === 'claude') return claudeCode('sonnet', claudeSettings(cwd))
  codexModel ??= listModels().then((r) => pickCodexModel(r.models))
  return codexCli(await codexModel, codexSettings(cwd))
}
