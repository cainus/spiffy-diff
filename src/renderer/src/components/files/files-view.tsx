import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FileMinus, FilePen, FilePlus, FileSymlink, Image } from 'lucide-react'
import { filePatch, type DiffFile } from '@shared/diff'
import { isNoise } from '@shared/noise'
import { PatchView } from '@/components/diff/patch-view'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { slideVariants, spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

const ICONS = { added: FilePlus, deleted: FileMinus, modified: FilePen, renamed: FileSymlink }

function fileStats(f: DiffFile) {
  return {
    additions: f.hunks.reduce((n, h) => n + h.additions, 0),
    deletions: f.hunks.reduce((n, h) => n + h.deletions, 0),
  }
}

export function FilesView() {
  const { source, nav, nav$ } = useStore()
  const files = useMemo(() => source?.files ?? [], [source])
  const selected = files.find((f) => f.path === nav.file) ?? files[0]
  const [order, setOrder] = useState(0)
  const [diffStyle, setDiffStyle] = useState<'unified' | 'split'>('unified')

  useEffect(() => {
    if (!nav.file && files[0]) nav$({ type: 'openFile', path: files[0].path })
  }, [nav.file, files, nav$])

  const select = (f: DiffFile) => {
    setOrder(files.indexOf(f) >= files.indexOf(selected!) ? 1 : -1)
    nav$({ type: 'openFile', path: f.path })
  }

  return (
    <div className="flex h-full">
      <ScrollArea className="bg-sidebar/40 h-full w-72 shrink-0 border-r">
        <ul className="space-y-0.5 p-2">
          {files.map((f, i) => {
            const Icon = f.binary ? Image : ICONS[f.status]
            const s = fileStats(f)
            const active = f.path === selected?.path
            return (
              <motion.li
                key={f.path}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: Math.min(i * 0.015, 0.3) }}
              >
                <button
                  onClick={() => select(f)}
                  className={cn(
                    'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    isNoise(f.path) && 'opacity-60',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="file-active"
                      transition={spring}
                      className="bg-accent absolute inset-0 -z-10 rounded-md"
                    />
                  )}
                  <Icon className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.path}>
                    <span className="text-muted-foreground/70">
                      {f.path.slice(0, f.path.lastIndexOf('/') + 1)}
                    </span>
                    {f.path.slice(f.path.lastIndexOf('/') + 1)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    <span className="text-emerald-400">+{s.additions}</span>{' '}
                    <span className="text-rose-400">-{s.deletions}</span>
                  </span>
                </button>
              </motion.li>
            )
          })}
        </ul>
      </ScrollArea>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" custom={order} initial={false}>
          {selected && (
            <motion.div
              key={selected.path}
              custom={order}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="h-full"
            >
              <ScrollArea className="h-full">
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="truncate font-mono text-sm">
                      {selected.status === 'renamed'
                        ? `${selected.oldPath} → ${selected.path}`
                        : selected.path}
                    </h2>
                    <ToggleGroup
                      type="single"
                      size="sm"
                      variant="outline"
                      value={diffStyle}
                      onValueChange={(v) => v && setDiffStyle(v as 'unified' | 'split')}
                    >
                      <ToggleGroupItem value="unified">Unified</ToggleGroupItem>
                      <ToggleGroupItem value="split">Split</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  {selected.binary && (
                    <p className="text-muted-foreground text-sm">
                      This is a binary file. Spiffy does not show its diff.
                    </p>
                  )}
                  {selected.hunks.map((h, i) => (
                    <HunkBlock
                      key={h.id}
                      file={selected}
                      hunkId={h.id}
                      delay={i === 0 ? 120 : 120 + i * 40}
                      diffStyle={diffStyle}
                    />
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function HunkBlock({
  file,
  hunkId,
  delay,
  diffStyle,
}: {
  file: DiffFile
  hunkId: string
  delay: number
  diffStyle: 'unified' | 'split'
}) {
  const { owners, summary, nav$ } = useStore()
  const mine = owners.get(hunkId) ?? []
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {mine.map((o) => {
          const goal = summary?.goals.find((g) => g.id === o.goalId)
          const change = goal?.changes.find((c) => c.id === o.changeId)
          if (!goal || !change) return null
          return (
            <motion.button
              key={o.changeId}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => nav$({ type: 'openChange', goalId: goal.id, changeId: change.id })}
              className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-2 py-0.5 text-[11px]"
              title={`${goal.title} › ${change.title}`}
            >
              {goal.title} › {change.title}
            </motion.button>
          )
        })}
      </div>
      <PatchView patch={filePatch(file, [hunkId])} delay={delay} diffStyle={diffStyle} />
    </section>
  )
}
