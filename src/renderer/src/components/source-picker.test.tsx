// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceCandidate, SourceList } from '@shared/ipc'
import { SourcePicker } from './source-picker'

const updatedAt = '2026-01-01T00:00:00Z'
const branches: SourceCandidate[] = Array.from({ length: 60 }, (_, i) => ({
  kind: 'branch',
  name: `branch-${i}`,
  current: i === 0,
  author: 'ada',
  updatedAt,
  merged: i % 2 === 0,
  mine: i < 3,
}))
const list: SourceList = {
  current: 'branch-0',
  candidates: [
    {
      kind: 'pr',
      number: 9,
      title: 'Add retry',
      url: 'https://github.com/o/r/pull/9',
      branch: 'retry',
      author: 'bob',
      updatedAt,
      draft: false,
      mine: false,
    },
    ...branches,
  ],
}

function setup(onOpen = vi.fn()) {
  render(<SourcePicker repoPath="/repo" list={list} busy={false} onOpen={onOpen} />)
  return { onOpen, rows: () => within(screen.getByRole('list')).getAllByRole('button') }
}

beforeEach(() => localStorage.clear())

describe('the source picker', () => {
  it('shows one page, and loads the next page when the list scrolls to the end', () => {
    const { rows } = setup()
    expect(rows()).toHaveLength(25)

    fireEvent.scroll(screen.getByRole('list'))

    expect(rows()).toHaveLength(50)
  })

  it('searches, and opens a pull request by its URL', async () => {
    const user = userEvent.setup()
    const { onOpen, rows } = setup()

    await user.type(screen.getByLabelText('Search branches and pull requests'), 'retry')
    expect(rows()).toHaveLength(1)
    await user.click(rows()[0]!)
    await user.click(screen.getByRole('button', { name: 'Explain' }))

    expect(onOpen).toHaveBeenCalledWith({ kind: 'pr', url: 'https://github.com/o/r/pull/9' })
  })

  it('opens a branch with its uncommitted changes when it is the current branch', async () => {
    const user = userEvent.setup()
    const { onOpen } = setup()

    await user.click(screen.getByRole('button', { name: /^branch-0/ }))
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: 'Explain' }))

    expect(onOpen).toHaveBeenCalledWith({
      kind: 'branch',
      repoPath: '/repo',
      branch: 'branch-0',
      includeUncommitted: true,
    })
  })

  it('filters by kind, mine, and has changes, and remembers the filters', async () => {
    const user = userEvent.setup()
    const { rows } = setup()

    await user.click(screen.getByRole('button', { name: 'Pull requests' }))
    expect(rows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Branches' }))
    await user.click(screen.getByRole('button', { name: 'Mine' }))
    expect(rows()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Has changes' }))
    // The current branch stays, and branch-2 is merged.
    expect(rows()).toHaveLength(2)

    expect(JSON.parse(localStorage.getItem('spiffy.sourceFilters')!)).toEqual({
      kind: 'branch',
      mine: true,
      hideMerged: true,
    })
  })

  it('starts with the saved filters', () => {
    localStorage.setItem(
      'spiffy.sourceFilters',
      JSON.stringify({ kind: 'pr', mine: false, hideMerged: false }),
    )
    const { rows } = setup()

    expect(rows()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Pull requests' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})
