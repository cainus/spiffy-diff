import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { filePatch, type DiffFile } from '@shared/diff'
import { PatchView } from '@/components/diff/patch-view'
import { useStore } from '@/state/use-store'

interface HunkRowProps {
  file: DiffFile
  hunkId: string
  delay: number
  diffStyle?: 'unified' | 'split'
  /** Shown above the diff, for example the goal and change badges. */
  header?: ReactNode
}

/** One hunk: the diff on the left and its STE note in a column on the right. */
export function HunkRow({ file, hunkId, delay, diffStyle, header }: HunkRowProps) {
  const { summary } = useStore()
  const note = summary?.hunkNotes?.[hunkId]
  return (
    <section data-hunk={hunkId} className="grid grid-cols-[minmax(0,1fr)_16rem] items-start gap-4">
      <div className="min-w-0 space-y-1.5">
        {header}
        <PatchView patch={filePatch(file, [hunkId])} delay={delay} diffStyle={diffStyle} />
      </div>
      <motion.aside
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: delay / 1000 + 0.1, duration: 0.25 }}
        className="text-muted-foreground sticky top-4 border-l pl-3 text-sm leading-relaxed"
      >
        {note ?? <span className="italic opacity-60">No note for this hunk.</span>}
      </motion.aside>
    </section>
  )
}
