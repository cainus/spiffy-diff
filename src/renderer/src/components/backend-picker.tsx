import { motion } from 'motion/react'
import type { Backend } from '@shared/source'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

const BACKENDS: { id: Backend; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
]

/** Select the local agent. When a source is open, a change runs the summary again. */
export function BackendPicker({ onChange }: { onChange?: (b: Backend) => void }) {
  const { backend, setBackend } = useStore()
  return (
    <div className="bg-muted/60 relative flex rounded-full p-0.5 text-xs">
      {BACKENDS.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => (onChange ? onChange(b.id) : setBackend(b.id))}
          className={cn(
            'relative z-10 rounded-full px-3 py-1 transition-colors',
            backend === b.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {backend === b.id && (
            <motion.span
              layoutId="backend-pill"
              transition={spring}
              className="bg-background absolute inset-0 -z-10 rounded-full shadow-sm"
            />
          )}
          {b.label}
        </button>
      ))}
    </div>
  )
}
