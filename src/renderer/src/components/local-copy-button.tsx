import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { FolderGit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useStore } from '@/state/use-store'

/**
 * For a PR source, select a local copy of the repository. The agent then reads
 * that copy instead of a clone. spiffy-diff remembers it for later PRs. See PLAN.md decision 6.
 */
export function LocalCopyButton() {
  const { sessionId, source } = useStore()
  const [linked, setLinked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!sessionId || source?.kind !== 'pr') return null

  const pick = async () => {
    setError(null)
    const path = await window.spiffy.pickRepoFolder()
    if (!path) return
    try {
      await window.spiffy.linkRepo(sessionId, path)
      setLinked(path)
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="flex items-center gap-2">
      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-destructive max-w-72 truncate text-xs"
            title={error}
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Use a local copy"
        title={linked ? `Local copy: ${linked}` : 'Use a local copy of the repository'}
        onClick={() => void pick()}
        className={cn(linked && 'text-emerald-400')}
      >
        <FolderGit2 className="size-4" />
      </Button>
    </div>
  )
}
