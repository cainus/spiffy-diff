import type { ChatStatus, UIMessage } from 'ai'
import { describeTool } from '@shared/tool-activity'

/**
 * What the agent does now, or null when its text streams or it is done.
 * While the agent uses tools, it names the last tool. Otherwise the agent thinks.
 */
export function agentActivity(messages: UIMessage[], status: ChatStatus): string | null {
  if (status === 'submitted') return 'The agent thinks…'
  if (status !== 'streaming') return null
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return 'The agent thinks…'
  const part = [...last.parts].reverse().find((p) => p.type !== 'step-start')
  if (part?.type === 'text' && part.state === 'streaming') return null
  if (part?.type === 'dynamic-tool') {
    return describeTool(part.toolName, part.input) ?? `Using ${part.toolName}`
  }
  if (part && part.type.startsWith('tool-') && 'input' in part) {
    return describeTool(part.type.slice(5), part.input) ?? `Using ${part.type.slice(5)}`
  }
  return 'The agent thinks…'
}
