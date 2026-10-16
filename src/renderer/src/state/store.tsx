import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { DeepPartial } from 'ai'
import type { LoadRequest } from '@shared/ipc'
import type { SummaryProgress } from '@shared/progress'
import type { Backend, LoadedSource } from '@shared/source'
import { hunkOwners, type ModelSummary, type Summary } from '@shared/summary'
import { initialNav, navReducer, type NavAction, type NavState } from '@/lib/nav'
import { errorText } from '@/lib/errors'
import { StoreContext, type Store } from './use-store'

type Status = 'idle' | 'loading' | 'summarizing' | 'ready' | 'error'

export interface AppState {
  status: Status
  error: string | null
  sessionId: string | null
  source: LoadedSource | null
  summary: Summary | null
  partial: DeepPartial<ModelSummary> | null
  progress: SummaryProgress | null
  backend: Backend
  nav: NavState
}

type Action =
  | { type: 'loading' }
  | { type: 'loaded'; sessionId: string; source: LoadedSource }
  | { type: 'summarizing' }
  | { type: 'partial'; partial: DeepPartial<ModelSummary> }
  | { type: 'progress'; progress: SummaryProgress }
  | { type: 'summary'; summary: Summary }
  | { type: 'error'; error: string }
  | { type: 'backend'; backend: Backend }
  | { type: 'close' }
  | { type: 'nav'; action: NavAction }

const initial: AppState = {
  status: 'idle',
  error: null,
  sessionId: null,
  source: null,
  summary: null,
  partial: null,
  progress: null,
  backend: (localStorage.getItem('spiffy.backend') as Backend | null) ?? 'claude',
  nav: initialNav,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'loading':
      return { ...initial, backend: state.backend, status: 'loading' }
    case 'loaded':
      return { ...state, sessionId: action.sessionId, source: action.source }
    case 'summarizing':
      return {
        ...state,
        status: 'summarizing',
        summary: null,
        partial: null,
        progress: null,
        error: null,
        nav: initialNav,
      }
    case 'progress':
      return { ...state, progress: action.progress }
    case 'partial':
      return { ...state, partial: action.partial }
    case 'summary':
      return { ...state, status: 'ready', summary: action.summary, partial: null }
    case 'error':
      return { ...state, status: 'error', error: action.error }
    case 'backend':
      return { ...state, backend: action.backend }
    case 'close':
      return { ...initial, backend: state.backend }
    case 'nav':
      return { ...state, nav: navReducer(state.nav, action.action) }
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  })

  const run = useCallback(async (sessionId: string, backend: Backend) => {
    dispatch({ type: 'summarizing' })
    try {
      const summary = await window.spiffy.summarize(
        sessionId,
        backend,
        (partial) => dispatch({ type: 'partial', partial }),
        (progress) => dispatch({ type: 'progress', progress }),
      )
      dispatch({ type: 'summary', summary })
    } catch (e) {
      dispatch({ type: 'error', error: errorText(e) })
    }
  }, [])

  const open = useCallback(
    async (req: LoadRequest) => {
      dispatch({ type: 'loading' })
      try {
        const { sessionId, source } = await window.spiffy.loadSource(req)
        dispatch({ type: 'loaded', sessionId, source })
        await run(sessionId, latest.current.backend)
      } catch (e) {
        dispatch({ type: 'error', error: errorText(e) })
      }
    },
    [run],
  )

  const setBackend = useCallback((backend: Backend) => {
    localStorage.setItem('spiffy.backend', backend)
    dispatch({ type: 'backend', backend })
  }, [])

  const resummarize = useCallback(
    async (backend?: Backend) => {
      const { sessionId } = latest.current
      const chosen = backend ?? latest.current.backend
      if (backend) setBackend(backend)
      if (sessionId) await run(sessionId, chosen)
    },
    [run, setBackend],
  )

  const owners = useMemo(
    () => (state.summary ? hunkOwners(state.summary) : new Map()),
    [state.summary],
  )

  const store = useMemo<Store>(
    () => ({
      ...state,
      owners,
      open,
      resummarize,
      setBackend,
      close: () => dispatch({ type: 'close' }),
      nav$: (action) => dispatch({ type: 'nav', action }),
    }),
    [state, owners, open, resummarize, setBackend],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
