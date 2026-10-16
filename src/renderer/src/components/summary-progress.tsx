import { motion } from 'motion/react'
import { progressFraction, progressLabel } from '@shared/progress'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { spring } from '@/lib/motion'
import { useStore } from '@/state/use-store'

/** The progress of a new summary. Every step of the bar comes from real work. See shared/progress.ts. */
export function SummaryProgressBar() {
  const { progress } = useStore()
  const percent = progress ? Math.round(progressFraction(progress) * 100) : 0
  const label = progress ? progressLabel(progress) : 'The agent starts…'
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <Shimmer>{label}</Shimmer>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Summary progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-muted h-1 overflow-hidden rounded-full"
      >
        <motion.div
          className="from-primary h-full rounded-full bg-gradient-to-r to-violet-400"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={spring}
        />
      </div>
    </div>
  )
}
