import { motion } from 'motion/react'
import { ArrowRight, Boxes, Layers } from 'lucide-react'
import type { Hunk } from '@shared/diff'
import type { Goal } from '@shared/summary'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { itemVariants, spring } from '@/lib/motion'
import { lineStats } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { HIGHLIGHT, useHighlight } from '@/lib/use-highlight'
import { useStore } from '@/state/use-store'
import { Explained } from '@/components/explained'
import { LineStats } from './line-stats'

export function SourceLevel({ index }: { index: Map<string, Hunk> }) {
  const { summary, partial, source, status, nav, nav$ } = useStore()
  const all = lineStats([...index.keys()], index)
  const overview = summary?.overview ?? partial?.overview ?? ''

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl space-y-8 px-8 py-8">
        <motion.header variants={itemVariants} className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{source?.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
            <span>{source?.repo}</span>
            <LineStats stats={all} />
            {source?.dirtyHash && <Badge variant="outline">Includes uncommitted changes</Badge>}
          </div>
          {overview ? (
            summary ? (
              <Explained
                title={source?.title ?? ''}
                text={overview}
                className="max-w-3xl text-lg"
              />
            ) : (
              <p className="text-foreground/80 max-w-3xl text-lg leading-relaxed">{overview}</p>
            )
          ) : (
            status === 'summarizing' && (
              <Shimmer className="text-lg">The agent reads the changes…</Shimmer>
            )
          )}
        </motion.header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {summary
            ? summary.goals.map((goal, i) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  rank={i + 1}
                  index={index}
                  highlighted={nav.cursor === i}
                  onOpen={() => nav$({ type: 'drillIn', goalId: goal.id })}
                />
              ))
            : (Array.isArray(partial?.goals) ? partial.goals : []).map((g, i) => (
                <motion.div
                  key={i}
                  layout
                  variants={itemVariants}
                  initial="enter"
                  animate="center"
                  className="bg-card/60 space-y-2 rounded-xl border border-dashed p-5"
                >
                  <div className="font-medium">{g?.title || <Shimmer>Goal</Shimmer>}</div>
                  <p className="text-muted-foreground line-clamp-3 text-sm">{g?.description}</p>
                  <div className="text-muted-foreground text-xs">
                    {g?.changes?.length ?? 0} changes so far
                  </div>
                </motion.div>
              ))}
        </div>
      </div>
    </ScrollArea>
  )
}

function GoalCard({
  goal,
  rank,
  index,
  highlighted,
  onOpen,
}: {
  goal: Goal
  rank: number
  index: Map<string, Hunk>
  highlighted: boolean
  onOpen: () => void
}) {
  const ref = useHighlight<HTMLButtonElement>(highlighted)
  const stats = lineStats(
    goal.changes.flatMap((c) => c.hunkIds),
    index,
  )
  const Icon = goal.kind === 'model' ? Layers : Boxes
  return (
    <motion.button
      ref={ref}
      aria-current={highlighted || undefined}
      layoutId={`goal-${goal.id}`}
      variants={itemVariants}
      transition={spring}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className={cn(
        'group bg-card relative flex flex-col gap-3 overflow-hidden rounded-xl border p-5 text-left',
        'hover:border-primary/40 shadow-sm transition-colors hover:shadow-lg',
        goal.kind !== 'model' && 'bg-card/50 opacity-80',
        highlighted && HIGHLIGHT,
      )}
    >
      <div className="from-primary/10 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <motion.div layout="position" className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-xs">
          {goal.kind === 'model' ? rank : <Icon className="size-3.5" />}
        </span>
        <h2 className="text-base leading-snug font-medium">{goal.title}</h2>
      </motion.div>
      <p className="text-muted-foreground line-clamp-3 text-sm">{goal.description}</p>
      <div className="mt-auto flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {goal.changes.length} {goal.changes.length === 1 ? 'change' : 'changes'} ·{' '}
          <LineStats stats={stats} />
        </span>
        <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-1" />
      </div>
    </motion.button>
  )
}
