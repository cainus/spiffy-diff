import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import type { DeepPartial } from 'ai'
import type { LoadRequest } from '@shared/ipc'
import type { SummaryProgress } from '@shared/progress'
import type { Backend, LoadedSource } from '@shared/source'
import { hunkOwners, type ModelSummary, type Summary } from '@shared/summary'
import { initialNav, navReducer, restoreNav, type NavAction, type NavState } from '@/lib/nav'
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
  /** The number of the latest summary run. */
  runId: number
  /** The request of the open source. Spiffy saves it to open the source again at the next start. */
  request: LoadRequest | null
  /** A saved position to restore when the summary arrives. */
  resumeNav: NavState | null
  backend: Backend
  nav: NavState
}

type Action =
  | { type: 'loading'; request: LoadRequest; resumeNav: NavState | null }
  | { type: 'loaded'; sessionId: string; source: LoadedSource }
  | { type: 'summarizing'; runId: number }
  | { type: 'partial'; partial: DeepPartial<ModelSummary>; runId: number }
  | { type: 'progress'; progress: SummaryProgress; runId: number }
  | { type: 'summary'; summary: Summary; runId: number }
  | { type: 'error'; error: string; runId?: number }
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
  runId: 0,
  request: null,
  resumeNav: null,
  backend: (localStorage.getItem('spiffy.backend') as Backend | null) ?? 'claude',
  nav: initialNav,
}

const LAST_KEY = 'spiffy.last'

function readLast(): { request: LoadRequest; nav: NavState } | null {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as {
      request?: LoadRequest
      nav?: NavState
    } | null
    return last?.request && last.nav ? { request: last.request, nav: last.nav } : null
  } catch {
    return null
  }
}

function reducer(state: AppState, action: Action): AppState {
  if (
    'runId' in action &&
    action.type !== 'summarizing' &&
    action.runId !== undefined &&
    action.runId !== state.runId
  ) {
    return state
  }
  switch (action.type) {
    case 'loading':
      return {
        ...initial,
        backend: state.backend,
        status: 'loading',
        request: action.request,
        resumeNav: action.resumeNav,
      }
    case 'loaded':
      return { ...state, sessionId: action.sessionId, source: action.source }
    case 'summarizing':
      return {
        ...state,
        runId: action.runId,
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
    case 'summary': {
      const files = state.source?.files.map((f) => f.path) ?? []
      const nav = state.resumeNav ? restoreNav(state.resumeNav, action.summary, files) : state.nav
      return {
        ...state,
        status: 'ready',
        summary: action.summary,
        partial: null,
        nav,
        resumeNav: null,
      }
    }
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

  // Each summary run has a number. The reducer drops results of a run that is not the latest,
  // for example when you open a new source before the old summary is done.
  const runs = useRef(0)
  const run = useCallback(async (sessionId: string, backend: Backend) => {
    const runId = ++runs.current
    dispatch({ type: 'summarizing', runId })
    try {
      const summary = await window.spiffy.summarize(
        sessionId,
        backend,
        (partial) => dispatch({ type: 'partial', partial, runId }),
        (progress) => dispatch({ type: 'progress', progress, runId }),
      )
      dispatch({ type: 'summary', summary, runId })
    } catch (e) {
      dispatch({ type: 'error', error: errorText(e), runId })
    }
  }, [])

  const open = useCallback(
    async (req: LoadRequest, resumeNav: NavState | null = null) => {
      dispatch({ type: 'loading', request: req, resumeNav })
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

  // Save the open source and the position in it. The next start opens it again. See resume below.
  useEffect(() => {
    if (!state.request || state.resumeNav) return
    localStorage.setItem(LAST_KEY, JSON.stringify({ request: state.request, nav: state.nav }))
  }, [state.request, state.resumeNav, state.nav])

  // At start, open the last source at the saved position.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    const last = readLast()
    if (last) void open(last.request, last.nav)
  }, [open])

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
      close: () => {
        localStorage.removeItem(LAST_KEY)
        dispatch({ type: 'close' })
      },
      nav$: (action) => dispatch({ type: 'nav', action }),
    }),
    [state, owners, open, resummarize, setBackend],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}
