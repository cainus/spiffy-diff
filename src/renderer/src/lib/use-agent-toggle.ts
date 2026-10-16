import { useEffect, useRef, useState } from 'react'
import { usePanelRef } from 'react-resizable-panels'

const KEY = 'spiffy.agentOpen'
const ANIMATION_MS = 320

/** Open or close the agent panel. It starts closed, and spiffy-diff remembers the last choice. */
export function useAgentToggle() {
  const [open, setOpen] = useState(() => localStorage.getItem(KEY) === 'true')
  const [animating, setAnimating] = useState(false)
  const panelRef = usePanelRef()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  const set = (next: boolean): void => {
    localStorage.setItem(KEY, String(next))
    setOpen(next)
  }

  return {
    open,
    animating,
    panelRef,
    toggle: () => {
      const next = !open
      // Animate only a toggle. A drag of the handle must follow the pointer.
      setAnimating(true)
      clearTimeout(timer.current ?? undefined)
      timer.current = setTimeout(() => setAnimating(false), ANIMATION_MS)
      if (next) {
        panelRef.current?.expand()
        // A panel that was never open has no size to go back to.
        if ((panelRef.current?.getSize().asPercentage ?? 0) < 25) panelRef.current?.resize('32%')
      }
      if (!next) panelRef.current?.collapse()
      set(next)
    },
    /** A drag of the handle can close or open the panel. */
    sync: (isOpen: boolean) => {
      if (isOpen !== open && !animating) set(isOpen)
    },
  }
}
