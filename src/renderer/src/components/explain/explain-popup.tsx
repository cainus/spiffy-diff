import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Loader2, RotateCw } from 'lucide-react'
import { phraseKey } from '@shared/terms'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { anchorOf, useExplain, type Anchor } from '@/state/use-explain'
import { PhraseText } from './phrase-text'

/** The stack of explanation popups. Select text in a popup to open the next popup on top of it. */
export function ExplainPopup() {
  return <PopupLevel level={0} />
}

/**
 * One popup of the stack. It renders the next level inside its own content. So in the React tree,
 * an upper popup is inside the lower popups: a click in it does not close them, and Escape closes
 * only the top popup.
 */
function PopupLevel({ level }: { level: number }) {
  const { popups, entries, open, closeFrom, refresh } = useExplain()
  const popup = popups[level]
  const covered = popups.length > level + 1
  const anchor = useMemo(() => virtualAnchor(popup?.anchor), [popup?.anchor])
  if (!popup) return null
  const { step } = popup
  const entry = entries[phraseKey(step.phrase)]

  return (
    <Popover open onOpenChange={(o) => !o && closeFrom(level)}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-explain-popup={level}
        aria-label={step.phrase}
        className="w-96 overflow-hidden p-0"
        style={{ zIndex: 50 + level }}
        align="start"
        // Keep the focus where it is, so a selection in a lower popup stays.
        onOpenAutoFocus={(e) => e.preventDefault()}
        // A click in a lower popup closes only the popups above it.
        onPointerDownOutside={(e) => {
          const target = e.target as Element | null
          // The Explain button of a selection opens the next popup. It must not close this one.
          if (target?.closest?.('[data-explain-selection]')) return e.preventDefault()
          const lower = target?.closest?.('[data-explain-popup]')
          if (lower && Number(lower.getAttribute('data-explain-popup')) < level) {
            e.preventDefault()
            closeFrom(level)
          }
        }}
      >
        <motion.div
          key={phraseKey(step.phrase)}
          initial={{ opacity: 0, scale: 0.92, y: -6 }}
          animate={{ opacity: covered ? 0.75 : 1, scale: covered ? 0.985 : 1, y: 0 }}
          transition={spring}
          className="space-y-2 p-4"
        >
          <div className="flex items-center gap-2">
            {level > 0 && (
              <span
                className="text-muted-foreground font-mono text-[10px]"
                title="The depth of this popup"
              >
                {level + 1}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{step.phrase}</span>
            <button
              type="button"
              aria-label="Explain again"
              title="Explain again"
              disabled={entry?.status === 'loading'}
              onClick={() => refresh(level)}
              className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-40"
            >
              <RotateCw className={cn('size-3.5', entry?.status === 'loading' && 'animate-spin')} />
            </button>
          </div>
          {entry?.status === 'loading' && (
            <div role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
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
                onPhrase={(phrase, rect) =>
                  open({ phrase, context: entry.text }, anchorOf(rect), level + 1)
                }
              />
            </p>
          )}
        </motion.div>
        <PopupLevel level={level + 1} />
      </PopoverContent>
    </Popover>
  )
}

/** An anchor without an element. A fixed element inside a moved popup is not at the right place. */
function virtualAnchor(anchor: Anchor | undefined) {
  const rect = anchor ?? { x: 0, y: 0, width: 0, height: 0 }
  return {
    current: {
      getBoundingClientRect: () => DOMRect.fromRect(rect),
    },
  }
}
