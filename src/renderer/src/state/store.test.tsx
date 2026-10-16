// @vitest-environment jsdom
import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpiffyBridge } from '@shared/ipc'
import type { LoadedSource } from '@shared/source'
import { StoreProvider } from './store'
import { useStore, type Store } from './use-store'

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 't',
  body: '',
  prUrl: null,
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: [],
}

const held: { store?: Store } = {}
function Probe() {
  const s = useStore()
  useEffect(() => {
    held.store = s
  })
  return null
}

beforeEach(() => {
  localStorage.clear()
  window.spiffy = {
    loadSource: vi.fn(async () => ({ sessionId: 's1', source })),
    summarize: vi.fn(async () => ({ overview: '', goals: [] })),
    rerunChange: vi.fn(() => () => {}),
  } as unknown as SpiffyBridge
})

describe('rerunChange', () => {
  it('starts one run for a change while a run of that change is in progress', async () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    await act(() => held.store!.open({ kind: 'pr', url: 'https://github.com/o/r/pull/1' }))

    act(() => held.store!.rerunChange('g1', 'g1.c1', 'detail'))
    act(() => held.store!.rerunChange('g1', 'g1.c1', 'detail'))
    act(() => held.store!.rerunChange('g1', 'g1.c2', 'detail'))

    expect(window.spiffy.rerunChange).toHaveBeenCalledTimes(2)
  })
})
