import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Baby, Loader2 } from 'lucide-react'
import { splitTerms } from '@shared/terms'
import { TermButton } from '@/components/term-popup'
import { errorText } from '@/lib/errors'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

/** Text with underlined terms. A click on a term opens a popup where the agent explains it. */
export function TermText({ text }: { text: string }) {
  const { summary } = useStore()
  return (
    <>
      {splitTerms(text, summary?.terms ?? []).map((part, i) =>
        part.term ? (
          <TermButton key={i} term={part.term} context={text}>
            {part.text}
          </TermButton>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

/** An explanation with underlined terms and an ELI5 button that asks the agent to explain it as for a child. */
export function Explained({
  title,
  text,
  className,
}: {
  title: string
  text: string
  className?: string
}) {
  const { sessionId, backend } = useStore()
  const [open, setOpen] = useState(false)
  const [simple, setSimple] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const cancel = useRef<(() => void) | null>(null)
  useEffect(() => () => cancel.current?.(), [])

  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    if (state === 'done' || state === 'loading' || !sessionId) return
    setSimple('')
    setState('loading')
    cancel.current = window.spiffy.simplify(
      { sessionId, backend, title, text },
      {
        onChunk: (delta) => setSimple((s) => s + delta),
        onEnd: () => setState('done'),
        onError: (m) => {
          setSimple(errorText(m))
          setState('error')
        },
      },
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start gap-2">
        <p className="text-foreground/80 flex-1 leading-relaxed">
          <TermText text={text} />
        </p>
        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={toggle}
          aria-label="Explain like I am five"
          aria-pressed={open}
          title="Explain like I am five"
          className={cn(
            'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-colors',
            open
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Baby className="size-3" />
          ELI5
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'rounded-lg border border-dashed p-3 text-[0.95em] leading-relaxed',
                state === 'error'
                  ? 'border-destructive/50 text-destructive'
                  : 'bg-primary/5 border-primary/30',
              )}
            >
              {simple || (
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> The agent makes it simple…
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
