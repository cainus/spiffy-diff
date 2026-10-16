import { useSyncExternalStore } from 'react'

export type DiffStyle = 'unified' | 'split'

const KEY = 'spiffy.diffStyle'
const listeners = new Set<() => void>()

function read(): DiffStyle {
  return localStorage.getItem(KEY) === 'split' ? 'split' : 'unified'
}

/** The diff style of every diff in the app. It persists between runs. */
export function useDiffStyle(): [DiffStyle, (style: DiffStyle) => void] {
  const style = useSyncExternalStore((onChange) => {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  }, read)
  return [
    style,
    (next) => {
      localStorage.setItem(KEY, next)
      listeners.forEach((l) => l())
    },
  ]
}
