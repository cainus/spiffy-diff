import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { blockAt, hunkBlocks, type Block } from '@shared/blocks'
import { filePatch, type DiffFile } from '@shared/diff'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { BlockPopover } from '@/components/diff/block-popover'
import { PatchView, type LineHover } from '@/components/diff/patch-view'
import { PhraseText } from '@/components/explain/phrase-text'
import { useDiffStyle } from '@/lib/diff-style'
import { useStore } from '@/state/use-store'

interface HunkRowProps {
  file: DiffFile
  hunkId: string
  delay: number
  /** Shown above the diff, for example the goal and change badges. */
  header?: ReactNode
  /** The agent writes the notes of this hunk now. */
  pending?: boolean
}

/** Time to move the pointer to the next line, or onto the popover, before the popover closes. */
const HIDE_DELAY_MS = 200

/**
 * One hunk: the diff on the left, and in the margin a note that tells what the hunk changes and why.
 * A pointer on a red or green line shows what that code does, in a popover.
 */
export function HunkRow({ file, hunkId, delay, header, pending = false }: HunkRowProps) {
  const { summary } = useStore()
  const [diffStyle] = useDiffStyle()
  const note = summary?.hunkNotes?.[hunkId]
  const hunk = file.hunks.find((h) => h.id === hunkId)
  const blocks = useMemo(() => (hunk ? hunkBlocks(hunk) : []), [hunk])
  const [hover, setHover] = useState<{ block: Block; rect: DOMRect } | null>(null)
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  // The pointer is on the popover. The popover then stays, so that you can select its text.
  const onPopover = useRef(false)
  useEffect(() => () => clearTimeout(hide.current ?? undefined), [])

  const hasSelection = (): boolean => {
    const sel = window.getSelection()
    return !!sel && !sel.isCollapsed && !!popoverRef.current?.contains(sel.anchorNode)
  }
  // Close the popover, but not while the pointer is on it or while you have a selection in it.
  const hideLater = (): void => {
    clearTimeout(hide.current ?? undefined)
    hide.current = setTimeout(() => {
      if (onPopover.current) return
      if (!hasSelection()) return setHover(null)
      const retry = (): void => {
        if (hasSelection()) return
        document.removeEventListener('selectionchange', retry)
        if (!onPopover.current) setHover(null)
      }
      document.addEventListener('selectionchange', retry)
    }, HIDE_DELAY_MS)
  }

  const onLineHover = (line: LineHover | null): void => {
    const block = line ? blockAt(blocks, line.side, line.lineNumber) : null
    if (line && block) {
      clearTimeout(hide.current ?? undefined)
      // A popover with a selection keeps its block.
      if (!hasSelection()) setHover({ block, rect: line.element.getBoundingClientRect() })
    } else hideLater()
  }

  return (
    <section data-hunk={hunkId} className="grid grid-cols-[minmax(0,1fr)_16rem] items-start gap-4">
      <div className="min-w-0 space-y-1.5">
        {header}
        <PatchView
          patch={filePatch(file, [hunkId])}
          delay={delay}
          diffStyle={diffStyle}
          onLineHover={onLineHover}
        />
      </div>
      <motion.aside
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: delay / 1000 + 0.1, duration: 0.25 }}
        className="text-muted-foreground sticky top-4 space-y-1.5 border-l pl-3 text-sm leading-relaxed"
      >
        {pending && (
          <div role="status" aria-label="Why note" className="text-xs">
            <Shimmer>Finding why this changed…</Shimmer>
          </div>
        )}
        {note ? (
          <div className={pending ? 'opacity-50' : undefined}>
            <PhraseText text={note} />
          </div>
        ) : (
          !pending && <span className="italic opacity-60">No note for this hunk.</span>
        )}
      </motion.aside>
      {hover && (
        <BlockPopover
          block={hover.block}
          text={summary?.blockNotes?.[hover.block.id]}
          pending={pending}
          rect={hover.rect}
          popoverRef={popoverRef}
          onPointerEnter={() => {
            onPopover.current = true
            clearTimeout(hide.current ?? undefined)
          }}
          onPointerLeave={() => {
            onPopover.current = false
            hideLater()
          }}
        />
      )}
    </section>
  )
}
