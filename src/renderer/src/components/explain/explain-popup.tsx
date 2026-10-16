import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Loader2, RotateCw } from 'lucide-react'
import { phraseKey } from '@shared/terms'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { slideVariants } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useExplain } from '@/state/use-explain'
import { PhraseText } from './phrase-text'

/**
 * The popup with the explanation of a phrase. Select text in it to explain that text in the same popup.
 * Back returns to the last phrase. Refresh asks the agent again and replaces the saved answer.
 */
export function ExplainPopup() {
  const { popup, entries, push, back, close, refresh } = useExplain()
  const current = popup?.trail[popup.trail.length - 1]
  const previous = popup && popup.trail.length > 1 ? popup.trail[popup.trail.length - 2] : null
  const entry = current ? entries[phraseKey(current.phrase)] : undefined

  return (
    <Popover open={!!popup} onOpenChange={(o) => !o && close()}>
      <PopoverAnchor asChild>
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: popup?.anchor.x ?? 0,
            top: popup?.anchor.y ?? 0,
            width: popup?.anchor.width ?? 0,
            height: popup?.anchor.height ?? 0,
            pointerEvents: 'none',
          }}
        />
      </PopoverAnchor>
      {current && (
        <PopoverContent
          data-explain-popup=""
          aria-label={current.phrase}
          className="w-96 overflow-hidden p-0"
          align="start"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={popup!.direction}>
            <motion.div
              key={phraseKey(current.phrase) + popup!.trail.length}
              custom={popup!.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-2 p-4"
            >
              <div className="flex items-center gap-2">
                {previous && (
                  <button
                    type="button"
                    aria-label={`Back to ${previous.phrase}`}
                    onClick={back}
                    className="text-muted-foreground hover:text-foreground rounded p-0.5"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{current.phrase}</span>
                <button
                  type="button"
                  aria-label="Explain again"
                  title="Explain again"
                  disabled={entry?.status === 'loading'}
                  onClick={refresh}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-40"
                >
                  <RotateCw
                    className={cn('size-3.5', entry?.status === 'loading' && 'animate-spin')}
                  />
                </button>
              </div>
              {entry?.status === 'loading' && (
                <div
                  role="status"
                  className="text-muted-foreground flex items-center gap-2 text-xs"
                >
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                  <span className="truncate">{entry.activity ?? 'The agent reads the code…'}</span>
                </div>
              )}
              {entry?.text && (
                <p
                  className={cn(
                    'text-sm leading-relaxed select-text',
                    entry.status === 'error' ? 'text-destructive' : 'text-foreground/85',
                  )}
                >
                  <PhraseText
                    text={entry.text}
                    onPhrase={(phrase) => push({ phrase, context: entry.text })}
                  />
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </PopoverContent>
      )}
    </Popover>
  )
}
