import type { LineStats as Stats } from '@/lib/stats'

export function LineStats({ stats, showFiles = true }: { stats: Stats; showFiles?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums">
      <span className="text-emerald-400">+{stats.additions}</span>
      <span className="text-rose-400">-{stats.deletions}</span>
      {showFiles && (
        <span className="text-muted-foreground">
          {stats.files} {stats.files === 1 ? 'file' : 'files'}
        </span>
      )}
    </span>
  )
}
