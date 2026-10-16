import { createContext, useContext } from 'react'
import type { LoadRequest } from '@shared/ipc'
import type { Backend } from '@shared/source'
import type { HunkOwner } from '@shared/summary'
import type { NavAction } from '@/lib/nav'
import type { AppState } from './store'

export interface Store extends AppState {
  owners: Map<string, HunkOwner[]>
  open: (req: LoadRequest) => Promise<void>
  resummarize: (backend?: Backend) => Promise<void>
  setBackend: (backend: Backend) => void
  close: () => void
  nav$: (action: NavAction) => void
}

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be inside StoreProvider')
  return store
}
