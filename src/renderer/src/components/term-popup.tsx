import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { parseMarkedTerms, type Term, type TermPart } from '@shared/terms'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { errorText } from '@/lib/errors'
import { slideVariants } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

const KIND_LABEL: Record<Term['kind'], string> = {
  jargon: 'technical term',
  code: 'code concept',
  business: 'business concept',
}

const KIND_STYLE: Record<Term['kind'], string> = {
  jargon: 'decoration-sky-400/70 decoration-dotted',
  code: 'decoration-emerald-400/70 decoration-solid font-mono text-[0.92em]',
  business: 'decoration-amber-400/80 decoration-wavy',
}

/** An underlined term. The style shows the kind of term. */
function TermWord({
  term,
  children,
  className,
  ...rest
}: { term: Term; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={`Ask about the ${KIND_LABEL[term.kind]} ${term.term}`}
      title={`Explain this ${KIND_LABEL[term.kind]}`}
      {...rest}
      className={cn(
        'hover:text-foreground cursor-help underline underline-offset-4 transition-colors',
        KIND_STYLE[term.kind],
        className,
      )}
    >
      {children}
    </button>
  )
}

interface Step {
  term: Term
  context: string
}

interface Explanation {
  text: string
  activity: string | null
  status: 'loading' | 'done' | 'error'
}

const keyOf = (t: Term): string => `${t.kind}:${t.term.toLowerCase()}`
const plainText = (parts: TermPart[]): string => parts.map((p) => p.text).join('')

/**
 * A term that opens a popup. The agent explains the term in the popup. Terms in the explanation
 * are underlined too, and a click explains them in the same popup. Back returns to the last term.
 */
export function TermButton({
  term,
  context,
  children,
}: {
  term: Term
  context: string
  children: ReactNode
}) {
  const { sessionId, backend } = useStore()
  const [open, setOpen] = useState(false)
  const [trail, setTrail] = useState<Step[]>([])
  const [answers, setAnswers] = useState<Record<string, Explanation>>({})
  const [direction, setDirection] = useState<1 | -1>(1)
  const cancels = useRef<(() => void)[]>([])
  useEffect(() => () => cancels.current.forEach((c) => c()), [])

  const update = (key: string, fn: (e: Explanation) => Explanation): void =>
    setAnswers((a) => ({
      ...a,
      [key]: fn(a[key] ?? { text: '', activity: null, status: 'loading' }),
    }))

  const explore = (step: Step): void => {
    const key = keyOf(step.term)
    if (answers[key] || !sessionId) return
    update(key, () => ({ text: '', activity: null, status: 'loading' }))
    cancels.current.push(
      window.spiffy.explainTerm(
        { sessionId, backend, term: step.term, context: step.context },
        {
          onChunk: (e) =>
            update(key, (x) =>
              e.type === 'activity'
                ? { ...x, activity: e.text }
                : e.type === 'reset'
                  ? { ...x, text: '' }
                  : { ...x, text: x.text + e.delta },
            ),
          onEnd: () => update(key, (x) => ({ ...x, status: 'done' })),
          onError: (m) => update(key, (x) => ({ ...x, status: 'error', text: errorText(m) })),
        },
      ),
    )
  }

  const push = (step: Step): void => {
    setDirection(1)
    setTrail((t) => [...t, step])
    explore(step)
  }
  const back = (): void => {
    setDirection(-1)
    setTrail((t) => t.slice(0, -1))
  }

  const current = trail[trail.length - 1] ?? { term, context }
  const previous = trail.length > 0 ? (trail[trail.length - 2] ?? { term, context }) : null
  const answer = answers[keyOf(current.term)]
  const parts = answer ? parseMarkedTerms(answer.text, current.term.term) : []

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setTrail([])
          explore({ term, context })
        }
      }}
    >
      <PopoverTrigger asChild>
        <TermWord term={term}>{children}</TermWord>
      </PopoverTrigger>
      <PopoverContent
        aria-label={current.term.term}
        className="w-96 overflow-hidden p-0"
        align="start"
      >
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={keyOf(current.term)}
            custom={direction}
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
                  aria-label={`Back to ${previous.term.term}`}
                  onClick={back}
                  className="text-muted-foreground hover:text-foreground rounded p-0.5"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              )}
              <span className="font-medium">{current.term.term}</span>
              <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
                {KIND_LABEL[current.term.kind]}
              </span>
            </div>
            {answer?.status === 'loading' && (
              <div role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="size-3 shrink-0 animate-spin" />
                <span className="truncate">{answer.activity ?? 'The agent reads the code…'}</span>
              </div>
            )}
            <p
              className={cn(
                'text-sm leading-relaxed',
                answer?.status === 'error' ? 'text-destructive' : 'text-foreground/85',
              )}
            >
              {parts.map((p, i) =>
                p.term ? (
                  <TermWord
                    key={i}
                    term={p.term}
                    onClick={() => push({ term: p.term!, context: plainText(parts) })}
                  >
                    {p.text}
                  </TermWord>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </p>
          </motion.div>
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  )
}
