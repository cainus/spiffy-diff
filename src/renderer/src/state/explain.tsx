import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { phraseKey } from '@shared/terms'
import { errorText } from '@/lib/errors'
import { useStore } from '@/state/use-store'
import { ExplainContext, type Entry, type ExplainApi, type Popup, type Step } from './use-explain'

/**
 * Explanations of phrases that the user selects. Main saves each answer for the repository,
 * and this provider loads the saved answers when a source opens.
 */
export function ExplainProvider({ children }: { children: ReactNode }) {
  const { sessionId, backend } = useStore()
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [popup, setPopup] = useState<Popup | null>(null)
  const cancels = useRef<(() => void)[]>([])

  useEffect(() => {
    if (!sessionId) return
    let live = true
    void window.spiffy.explanations(sessionId).then((saved) => {
      if (!live) return
      const loaded: Record<string, Entry> = {}
      for (const [key, e] of Object.entries(saved)) {
        loaded[key] = { phrase: e.phrase, text: e.text, activity: null, status: 'done' }
      }
      setEntries((now) => ({ ...loaded, ...now }))
    })
    return () => {
      live = false
    }
  }, [sessionId])
  useEffect(() => () => cancels.current.forEach((c) => c()), [])

  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  })

  const explore = useCallback(
    (step: Step, force = false) => {
      const key = phraseKey(step.phrase)
      const known = entriesRef.current[key]
      if (!sessionId || (!force && known && known.status !== 'error')) return
      const update = (fn: (e: Entry) => Entry): void =>
        setEntries((all) => ({
          ...all,
          [key]: fn(
            all[key] ?? { phrase: step.phrase, text: '', activity: null, status: 'loading' },
          ),
        }))
      update(() => ({ phrase: step.phrase, text: '', activity: null, status: 'loading' }))
      cancels.current.push(
        window.spiffy.explainTerm(
          { sessionId, backend, phrase: step.phrase, context: step.context },
          {
            onChunk: (e) =>
              update((x) =>
                e.type === 'activity'
                  ? { ...x, activity: e.text }
                  : e.type === 'reset'
                    ? { ...x, text: '' }
                    : { ...x, text: x.text + e.delta },
              ),
            onEnd: () => update((x) => ({ ...x, status: 'done' })),
            onError: (m) => update((x) => ({ ...x, status: 'error', text: errorText(m) })),
          },
        ),
      )
    },
    [sessionId, backend],
  )

  const api = useMemo<ExplainApi>(
    () => ({
      entries,
      phrases: Object.values(entries)
        .filter((e) => e.status === 'done')
        .map((e) => e.phrase),
      popup,
      open: (step, anchor) => {
        setPopup({ anchor, trail: [step], direction: 1 })
        explore(step)
      },
      push: (step) => {
        setPopup((p) => (p ? { ...p, trail: [...p.trail, step], direction: 1 } : p))
        explore(step)
      },
      back: () =>
        setPopup((p) =>
          p && p.trail.length > 1 ? { ...p, trail: p.trail.slice(0, -1), direction: -1 } : p,
        ),
      close: () => setPopup(null),
      refresh: () => {
        const step = popup?.trail[popup.trail.length - 1]
        if (step) explore(step, true)
      },
    }),
    [entries, popup, explore],
  )

  return <ExplainContext.Provider value={api}>{children}</ExplainContext.Provider>
}
