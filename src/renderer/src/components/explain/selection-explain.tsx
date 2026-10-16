import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Sparkles } from 'lucide-react'
import { spring } from '@/lib/motion'
import { anchorOf, useExplain, type Anchor } from '@/state/use-explain'

const MAX_PHRASE = 200

interface Pick {
  phrase: string
  context: string
  inPopup: boolean
  anchor: Anchor
}

function readSelection(): Pick | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const phrase = sel.toString().trim().replace(/\s+/g, ' ')
  if (!phrase || phrase.length > MAX_PHRASE) return null
  const node = sel.anchorNode
  const el = node instanceof Element ? node : node?.parentElement
  const root = el?.closest('[data-explainable]')
  if (!root) return null
  const range = sel.getRangeAt(0)
  // jsdom has no layout, so a range there has no getBoundingClientRect.
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : root.getBoundingClientRect()
  return {
    phrase,
    context: root.textContent ?? '',
    inPopup: !!root.closest('[data-explain-popup]'),
    anchor: anchorOf(rect),
  }
}

/** A small button at a text selection. It explains the selected phrase. */
export function SelectionExplain() {
  const { open, push } = useExplain()
  const [pick, setPick] = useState<Pick | null>(null)

  useEffect(() => {
    const update = (): void => setPick(readSelection())
    const clear = (): void => {
      if (window.getSelection()?.isCollapsed) setPick(null)
    }
    document.addEventListener('mouseup', update)
    document.addEventListener('keyup', update)
    document.addEventListener('selectionchange', clear)
    return () => {
      document.removeEventListener('mouseup', update)
      document.removeEventListener('keyup', update)
      document.removeEventListener('selectionchange', clear)
    }
  }, [])

  return (
    <AnimatePresence>
      {pick && (
        <motion.button
          key="explain-selection"
          type="button"
          aria-label="Explain selection"
          initial={{ opacity: 0, y: 4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={spring}
          style={{
            position: 'fixed',
            left: pick.anchor.x,
            top: pick.anchor.y + pick.anchor.height + 6,
          }}
          // Keep the selection when the button takes the mouse down.
          onMouseDown={(e) => e.preventDefault()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={() => {
            const step = { phrase: pick.phrase, context: pick.context }
            if (pick.inPopup) push(step)
            else open(step, pick.anchor)
            window.getSelection()?.removeAllRanges()
            setPick(null)
          }}
          className="bg-primary text-primary-foreground z-50 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-lg"
        >
          <Sparkles className="size-3" />
          Explain
        </motion.button>
      )}
    </AnimatePresence>
  )
}
