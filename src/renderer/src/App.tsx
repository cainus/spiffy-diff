import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Loader2 } from 'lucide-react'
import type { LoadRequest } from '@shared/ipc'
import { StartScreen } from '@/components/start-screen'
import { ErrorBoundary } from '@/components/error-boundary'
import { Workspace } from '@/components/workspace'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StoreProvider } from '@/state/store'
import { useStore } from '@/state/use-store'

/** The screen while the app opens the last source at start. */
function Reopening({ request }: { request: LoadRequest | null }) {
  const what = request?.kind === 'pr' ? request.url.replace(/^https?:\/\//, '') : request?.branch
  return (
    <div
      role="status"
      aria-label="Reopening"
      className="text-muted-foreground flex h-screen items-center justify-center gap-2 text-sm"
    >
      <Loader2 className="size-4 animate-spin" />
      Reopening {what}…
    </div>
  )
}

function Screens() {
  const { source, close, resuming, request } = useStore()
  const screen = source ? 'workspace' : resuming ? 'reopening' : 'start'
  return (
    <LayoutGroup>
      <AnimatePresence mode="wait">
        <motion.div
          key={screen === 'reopening' ? 'workspace' : screen}
          // The workspace only fades in, so the top bar and the app name stay still.
          // The start screen zooms in and out.
          initial={{ opacity: 0, scale: source ? 1 : 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: source ? 1 : 0.96 }}
          transition={{ duration: 0.25 }}
        >
          <ErrorBoundary onReset={close}>
            {screen === 'workspace' ? (
              <Workspace />
            ) : screen === 'reopening' ? (
              <Reopening request={request} />
            ) : (
              <StartScreen />
            )}
          </ErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <StoreProvider>
        <Screens />
      </StoreProvider>
    </TooltipProvider>
  )
}
