import { AnimatePresence, motion } from 'motion/react'
import { GitCommitHorizontal, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { spring } from '@/lib/motion'
import { useVersionWatch } from '@/lib/use-version-watch'
import { useStore } from '@/state/use-store'

/** A banner that tells when the open PR or branch has a new version, with a Reload button. */
export function VersionBanner() {
  const { sessionId, request, nav, source, open } = useStore()
  const { changed, dismiss } = useVersionWatch(sessionId)
  const what = source?.kind === 'pr' ? 'This PR has new commits.' : 'This branch has new changes.'

  return (
    <AnimatePresence>
      {changed && request && (
        <motion.div
          role="status"
          aria-label="New version"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={spring}
          className="bg-primary/10 overflow-hidden border-b"
        >
          <div className="flex items-center gap-3 px-4 py-2 text-sm">
            <GitCommitHorizontal className="text-primary size-4 shrink-0" />
            <span className="flex-1">{what} The summary shows the old version.</span>
            <Button
              size="sm"
              onClick={() => {
                dismiss()
                void open(request, nav)
              }}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              Reload
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
