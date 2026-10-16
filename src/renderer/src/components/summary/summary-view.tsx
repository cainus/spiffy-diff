import { useMemo } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { indexHunks } from '@/lib/stats'
import { levelVariants } from '@/lib/motion'
import { useStore } from '@/state/use-store'
import { ChangeLevel } from './change-level'
import { GoalLevel } from './goal-level'
import { SourceLevel } from './source-level'

/** The zoom stack: one level at a time. See PLAN.md decision 9. */
export function SummaryView() {
  const { nav, summary, source } = useStore()
  const index = useMemo(() => indexHunks(source?.files ?? []), [source])
  const { path, direction } = nav

  const goal =
    path.level !== 'source' ? summary?.goals.find((g) => g.id === path.goalId) : undefined
  const change =
    path.level === 'change' ? goal?.changes.find((c) => c.id === path.changeId) : undefined
  const key = change ? change.id : goal ? goal.id : 'source'

  return (
    <LayoutGroup>
      <AnimatePresence mode="popLayout" custom={direction} initial={false}>
        <motion.div
          key={key}
          custom={direction}
          variants={levelVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="h-full origin-top"
        >
          {change && goal ? (
            <ChangeLevel goal={goal} change={change} index={index} />
          ) : goal ? (
            <GoalLevel goal={goal} index={index} />
          ) : (
            <SourceLevel index={index} />
          )}
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  )
}
