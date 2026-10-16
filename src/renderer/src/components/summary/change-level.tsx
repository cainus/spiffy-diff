import { useEffect } from 'react'
import { CodeText } from '@/components/code-text'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, RotateCw } from 'lucide-react'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
  const { source, summary, nav$, reruns, rerunChange } = useStore()
  const rerun = reruns[change.id]
  const explained = summary?.detailed?.includes(change.id) ?? false
  // The first time a change shows, the agent writes its why notes and block notes. They are cached.
  useEffect(() => {
    if (!explained) rerunChange(goal.id, change.id, 'detail')
  }, [explained, goal.id, change.id, rerunChange])
  const pending = !!rerun?.running
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

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Rerun this change"
            title="The agent reads the code again and writes this change and its hunk notes again"
            disabled={rerun?.running}
            onClick={() => rerunChange(goal.id, change.id, 'rerun')}
            className="gap-1.5"
          >
            <RotateCw className={cn('size-3.5', rerun?.running && 'animate-spin')} />
            Rerun
          </Button>
          <AnimatePresence mode="wait" initial={false}>
            {rerun?.running && rerun.mode === 'rerun' && (
              <motion.span
                key={rerun.activity ?? 'start'}
                role="status"
                aria-label="Rerun"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
                className="min-w-0 truncate text-xs"
              >
                <Shimmer>{rerun.activity ?? 'The agent reads the code…'}</Shimmer>
              </motion.span>
            )}
            {rerun?.error && (
              <motion.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-destructive min-w-0 truncate text-xs"
              >
                {rerun.error}
              </motion.span>
            )}
          </AnimatePresence>
          <div className="ml-auto">
            <DiffStyleToggle />
          </div>
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
                <HunkRow
                  key={id}
                  file={g.file}
                  hunkId={id}
                  delay={240 + (i + j) * 60}
                  pending={pending}
                />
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    </ScrollArea>
  )
}
