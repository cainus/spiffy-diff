import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { StartScreen } from '@/components/start-screen'
import { ErrorBoundary } from '@/components/error-boundary'
import { Workspace } from '@/components/workspace'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StoreProvider } from '@/state/store'
import { useStore } from '@/state/use-store'

function Screens() {
  const { source, close } = useStore()
  return (
    <LayoutGroup>
      <AnimatePresence mode="wait">
        <motion.div
          key={source ? 'workspace' : 'start'}
          // The workspace only fades in, so the top bar and the app name stay still.
          // The start screen zooms in and out.
          initial={{ opacity: 0, scale: source ? 1 : 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: source ? 1 : 0.96 }}
          transition={{ duration: 0.25 }}
        >
          <ErrorBoundary onReset={close}>{source ? <Workspace /> : <StartScreen />}</ErrorBoundary>
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
