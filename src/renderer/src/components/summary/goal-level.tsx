import { motion } from 'motion/react'
import { ArrowRight, FileCode } from 'lucide-react'
import type { Hunk } from '@shared/diff'
import type { Goal } from '@shared/summary'
import { ScrollArea } from '@/components/ui/scroll-area'
import { itemVariants, spring } from '@/lib/motion'
import { lineStats } from '@/lib/stats'
import { useStore } from '@/state/use-store'
import { LineStats } from './line-stats'

export function GoalLevel({ goal, index }: { goal: Goal; index: Map<string, Hunk> }) {
  const { nav$ } = useStore()
  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-4xl space-y-6 px-8 py-8">
        <motion.header
          layoutId={`goal-${goal.id}`}
          transition={spring}
          className="bg-card space-y-3 rounded-xl border p-6 shadow-sm"
        >
          <motion.h1 layout="position" className="text-2xl font-semibold tracking-tight">
            {goal.title}
          </motion.h1>
          <p className="text-foreground/80 leading-relaxed">{goal.description}</p>
        </motion.header>

        <div className="relative space-y-3 pl-6">
          <div className="bg-border absolute top-2 bottom-2 left-2 w-px" />
          {goal.changes.map((change, i) => {
            const paths = [...new Set(change.hunkIds.flatMap((id) => index.get(id)?.path ?? []))]
            return (
              <motion.button
                key={change.id}
                layoutId={`change-${change.id}`}
                variants={itemVariants}
                transition={spring}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => nav$({ type: 'drillIn', goalId: goal.id, changeId: change.id })}
                className="group bg-card hover:border-primary/40 relative flex w-full flex-col gap-2 rounded-lg border p-4 text-left shadow-sm transition-colors"
              >
                <span className="bg-background border-primary/60 absolute top-5 -left-[1.42rem] size-2.5 rounded-full border-2" />
                <motion.div layout="position" className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">
                    <span className="text-muted-foreground mr-2 font-mono text-xs">{i + 1}</span>
                    {change.title}
                  </h2>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-1" />
                </motion.div>
                {change.description && (
                  <p className="text-muted-foreground text-sm">{change.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <LineStats stats={lineStats(change.hunkIds, index)} showFiles={false} />
                  {paths.slice(0, 4).map((p) => (
                    <span
                      key={p}
                      className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]"
                    >
                      <FileCode className="size-3" />
                      {p.split('/').pop()}
                    </span>
                  ))}
                  {paths.length > 4 && (
                    <span className="text-muted-foreground text-xs">+{paths.length - 4} more</span>
                  )}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
