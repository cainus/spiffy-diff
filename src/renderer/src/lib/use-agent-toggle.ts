import { useEffect, useRef, useState } from 'react'
import { usePanelRef } from 'react-resizable-panels'

const KEY = 'spiffy.agentOpen'
const PIN_KEY = 'spiffy.agentPinned'
const ANIMATION_MS = 320

/**
 * Open or close the agent panel. It starts closed, and spiffy-diff remembers the last choice.
 * An unpinned panel floats over the content. A pinned panel is beside the content, in a resizable panel.
 */
export function useAgentToggle() {
  const [open, setOpen] = useState(() => localStorage.getItem(KEY) === 'true')
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_KEY) === 'true')
  const [animating, setAnimating] = useState(false)
  const panelRef = usePanelRef()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  const set = (next: boolean): void => {
    localStorage.setItem(KEY, String(next))
    setOpen(next)
  }

  /** Open or close the resizable panel. Only a pinned, open agent uses it. */
  const dock = (next: boolean): void => {
    // Animate only a button. A drag of the handle must follow the pointer.
    setAnimating(true)
    clearTimeout(timer.current ?? undefined)
    timer.current = setTimeout(() => setAnimating(false), ANIMATION_MS)
    if (next) {
      panelRef.current?.expand()
      // A panel that was never open has no size to go back to.
      if ((panelRef.current?.getSize().asPercentage ?? 0) < 25) panelRef.current?.resize('32%')
    } else panelRef.current?.collapse()
  }

  return {
    open,
    pinned,
    /** True when the agent is beside the content. */
    docked: open && pinned,
    animating,
    panelRef,
    toggle: () => {
      if (pinned) dock(!open)
      set(!open)
    },
    togglePin: () => {
      localStorage.setItem(PIN_KEY, String(!pinned))
      setPinned(!pinned)
      if (open) dock(!pinned)
    },
    /** A drag of the handle can close or open a pinned panel. */
    sync: (isOpen: boolean) => {
      if (pinned && isOpen !== open && !animating) set(isOpen)
    },
  }
}
