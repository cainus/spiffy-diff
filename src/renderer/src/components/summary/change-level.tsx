import { CodeText } from '@/components/code-text'
import { motion } from 'motion/react'
import { ExternalLink } from 'lucide-react'
import type { Hunk } from '@shared/diff'
import type { Change, Goal } from '@shared/summary'
import { DiffStyleToggle } from '@/components/diff/diff-style-toggle'
import { HunkRow } from '@/components/diff/hunk-row'
import { ScrollArea } from '@/components/ui/scroll-area'
import { itemVariants, spring } from '@/lib/motion'
import { groupByFile, lineStats } from '@/lib/stats'
import { useStore } from '@/state/use-store'
import { Explained } from '@/components/explained'
import { LineStats } from './line-stats'

export function ChangeLevel({
  goal,
  change,
  index,
}: {
  goal: Goal
  change: Change
  index: Map<string, Hunk>
}) {
  const { source, nav$ } = useStore()
  const groups = groupByFile(change.hunkIds, source?.files ?? [])

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
        <motion.header
          layoutId={`change-${change.id}`}
          transition={spring}
          className="bg-card space-y-2 rounded-lg border p-5 shadow-sm"
        >
          <motion.div
            layout="position"
            className="text-muted-foreground text-xs tracking-wide uppercase"
          >
            {goal.title}
          </motion.div>
          <motion.h1 layout="position" className="text-xl font-semibold tracking-tight">
            <CodeText text={change.title} />
          </motion.h1>
          {change.description && <Explained title={change.title} text={change.description} />}
          <LineStats stats={lineStats(change.hunkIds, index)} />
        </motion.header>

        <div className="flex items-center justify-end gap-2">
          <DiffStyleToggle />
        </div>

        {groups.map((g, i) => (
          <motion.section key={g.file.path} variants={itemVariants} className="space-y-2">
            <button
              onClick={() => nav$({ type: 'openFile', path: g.file.path })}
              className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-1.5 font-mono text-sm"
            >
              {g.file.path}
              <ExternalLink className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <div className="space-y-3">
              {g.hunkIds.map((id, j) => (
                <HunkRow key={id} file={g.file} hunkId={id} delay={240 + (i + j) * 60} />
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    </ScrollArea>
  )
}
