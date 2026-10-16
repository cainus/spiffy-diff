import { createContext, useContext } from 'react'

export interface Step {
  phrase: string
  /** The text where the user found the phrase. */
  context: string
}

export interface Entry {
  phrase: string
  text: string
  activity: string | null
  status: 'loading' | 'done' | 'error'
}

export interface Anchor {
  x: number
  y: number
  width: number
  height: number
}

/** One open popup. Popup N+1 shows on top of popup N. */
export interface Popup {
  step: Step
  anchor: Anchor
}

export interface ExplainApi {
  entries: Record<string, Entry>
  /** The phrases with a saved explanation. The UI underlines them. */
  phrases: string[]
  /** The open popups, from the bottom to the top. */
  popups: Popup[]
  /** Open a popup at `level`. This closes the popups at `level` and above first. */
  open: (step: Step, anchor: Anchor, level?: number) => void
  /** Close the popups at `level` and above. */
  closeFrom: (level: number) => void
  /** Explain the phrase of the popup at `level` again. */
  refresh: (level: number) => void
}

export const ExplainContext = createContext<ExplainApi | null>(null)

export function useExplain(): ExplainApi {
  const api = useContext(ExplainContext)
  if (!api) throw new Error('useExplain must be inside ExplainProvider')
  return api
}

export function anchorOf(rect: { x: number; y: number; width: number; height: number }): Anchor {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
