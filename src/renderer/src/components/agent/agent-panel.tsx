import { useLayoutEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { AnimatePresence, motion } from 'motion/react'
import { Crosshair, Loader2, Pencil, Pin, PinOff, Plus, Sparkles, X } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { SkillDialog } from '@/components/agent/skill-dialog'
import { agentActivity } from '@/lib/agent-activity'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { ContextBox, IpcChatTransport } from '@/lib/ipc-transport'
import { currentFocus, focusLabel } from '@/lib/nav'
import { spring } from '@/lib/motion'
import { useSkills, type Skill } from '@/lib/skills'
import { useStore } from '@/state/use-store'

const SUGGESTIONS = {
  source: [
    'What is the risk of these changes?',
    'Which tests cover these changes?',
    'What must I review first?',
  ],
  goal: ['Why is this goal necessary?', 'What can break?', 'Is a part of this goal missing?'],
  change: ['Explain this code step by step.', 'What calls this code?', 'Is there a simpler way?'],
  file: ['Explain the changes in this file.', 'What uses this file?'],
} as const

/** One conversation for each source. Each message sends the current focus. See PLAN.md decision 7. */
export function AgentPanel({
  pinned,
  onPin,
  onClose,
}: {
  /** A pinned panel is beside the content. An unpinned panel floats over it. */
  pinned: boolean
  onPin: () => void
  onClose: () => void
}) {
  const store = useStore()
  const focus = currentFocus(store.nav)
  // The transport reads the context at send time, never during render.
  const [box] = useState(() => new ContextBox())
  useLayoutEffect(() => {
    box.set({ sessionId: store.sessionId ?? '', backend: store.backend, focus })
  })
  const [transport] = useState(() => new IpcChatTransport(window.spiffy, () => box.get()))
  const { messages, sendMessage, status, stop, error } = useChat({
    id: store.sessionId ?? 'none',
    transport,
  })
  const label = focusLabel(store.nav, store.summary)
  const activity = agentActivity(messages, status)

  const { skills, save, remove } = useSkills()
  // undefined: closed. null: a new skill.
  const [editing, setEditing] = useState<Skill | null | undefined>(undefined)

  const ask = (text: string) => {
    if (text.trim()) void sendMessage({ text })
  }

  return (
    <div className="bg-sidebar/30 flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="text-primary size-4" />
        <span className="text-sm font-medium">Agent</span>
        <span className="text-muted-foreground ml-auto text-xs capitalize">{store.backend}</span>
        <Button
          type="button"
          variant={pinned ? 'secondary' : 'ghost'}
          size="icon-xs"
          aria-label="Pin the agent"
          aria-pressed={pinned}
          title={pinned ? 'Float the agent over the content' : 'Put the agent beside the content'}
          onClick={onPin}
        >
          {pinned ? <PinOff /> : <Pin />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Close the agent"
          title="Close the agent"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Ask about these changes"
              description="The agent can read the files of the head commit. It cannot change files."
            />
          ) : (
            messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
              >
                <Message from={m.role}>
                  {/* You can select text in an answer to explain it. The answer is the context. */}
                  <MessageContent data-explainable={m.role === 'assistant' ? '' : undefined}>
                    {m.parts.map((p, i) =>
                      p.type === 'text' ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              </motion.div>
            ))
          )}
          <AnimatePresence>
            {activity && (
              <motion.div
                key="activity"
                role="status"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={spring}
                className="flex min-w-0 items-center gap-2"
              >
                <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={activity}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15 }}
                    className="min-w-0 truncate"
                  >
                    <Shimmer className="text-sm">{activity}</Shimmer>
                  </motion.span>
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <p className="text-destructive text-sm">{error.message}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="space-y-2 border-t p-3">
        <Suggestions>
          {SUGGESTIONS[focus.level].map((s) => (
            <Suggestion key={s} suggestion={s} onClick={ask} />
          ))}
        </Suggestions>
        <div className="flex flex-wrap items-center gap-1.5">
          {skills.map((s) => (
            <span key={s.id} className="inline-flex items-center rounded-full border text-xs">
              <button
                type="button"
                title={s.prompt}
                disabled={status === 'submitted' || status === 'streaming'}
                onClick={() => ask(s.prompt)}
                className="hover:bg-accent cursor-pointer rounded-l-full py-1 pr-1.5 pl-3 disabled:cursor-default disabled:opacity-50"
              >
                {s.name}
              </button>
              <button
                type="button"
                aria-label={`Edit skill ${s.name}`}
                onClick={() => setEditing(s)}
                className="text-muted-foreground hover:bg-accent cursor-pointer rounded-r-full py-1 pr-2 pl-1"
              >
                <Pencil className="size-3" />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Add skill"
            title="Add a skill button"
            onClick={() => setEditing(null)}
          >
            <Plus />
          </Button>
        </div>
        <PromptInput onSubmit={(m) => ask(m.text)}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask a question…" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={label}
                  layout
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.9 }}
                  transition={spring}
                  className="bg-primary/10 text-primary inline-flex max-w-56 items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px]"
                  title={label}
                >
                  <Crosshair className="size-3 shrink-0" />
                  <span className="truncate">{label}</span>
                </motion.span>
              </AnimatePresence>
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={() => void stop()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
      {editing !== undefined && (
        <SkillDialog
          skill={editing}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}
