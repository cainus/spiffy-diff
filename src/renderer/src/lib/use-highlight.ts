import { useEffect, useRef } from 'react'

/** A ref that scrolls its element into view when the arrow-key highlight comes to it. */
export function useHighlight<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [active])
  return ref
}

export const HIGHLIGHT = 'border-primary ring-primary/40 ring-2'
