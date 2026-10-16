import { useCallback, useEffect, useRef, useState } from 'react'

/** How often spiffy-diff asks if the source has a new version, while the window has the focus. */
export const CHECK_EVERY_MS = 60_000
/** A focus change checks at most this often. */
const FOCUS_GAP_MS = 15_000

/**
 * Watch the open source for new commits or new uncommitted changes. It checks every minute while
 * the window has the focus, and when the window gets the focus again. It does not reload by itself:
 * a new summary takes time, and the reader is maybe in the middle of a change.
 */
export function useVersionWatch(sessionId: string | null): {
  changed: boolean
  dismiss: () => void
} {
  const [changed, setChanged] = useState<string | null>(null)
  const last = useRef(0)

  const check = useCallback(async () => {
    if (!sessionId) return
    last.current = Date.now()
    if (await window.spiffy.checkSource(sessionId)) setChanged(sessionId)
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    last.current = 0
    const timer = setInterval(() => {
      if (document.hasFocus()) void check()
    }, CHECK_EVERY_MS)
    const onFocus = (): void => {
      if (Date.now() - last.current >= FOCUS_GAP_MS) void check()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [sessionId, check])

  return { changed: changed !== null && changed === sessionId, dismiss: () => setChanged(null) }
}
