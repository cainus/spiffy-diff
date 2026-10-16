import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { StartScreen } from '@/components/start-screen'
import { Workspace } from '@/components/workspace'
import { TooltipProvider } from '@/components/ui/tooltip'
import { StoreProvider } from '@/state/store'
import { useStore } from '@/state/use-store'

function Screens() {
  const { source } = useStore()
  return (
    <LayoutGroup>
      <AnimatePresence mode="wait">
        <motion.div
          key={source ? 'workspace' : 'start'}
          initial={{ opacity: 0, scale: source ? 0.96 : 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: source ? 1.04 : 0.96 }}
          transition={{ duration: 0.25 }}
        >
          {source ? <Workspace /> : <StartScreen />}
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
