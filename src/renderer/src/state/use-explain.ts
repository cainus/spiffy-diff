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

export interface Popup {
  anchor: Anchor
  trail: Step[]
  direction: 1 | -1
}

export interface ExplainApi {
  entries: Record<string, Entry>
  /** The phrases with a saved explanation. The UI underlines them. */
  phrases: string[]
  popup: Popup | null
  open: (step: Step, anchor: Anchor) => void
  push: (step: Step) => void
  back: () => void
  close: () => void
  refresh: () => void
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
