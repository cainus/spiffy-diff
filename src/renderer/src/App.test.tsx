// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { RerunRequest, SpiffyBridge, StreamHandlers } from '@shared/ipc'
import type { RerunEvent } from '@shared/rerun'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { App } from './App'
import { CHECK_EVERY_MS } from './lib/use-version-watch'

// The diff renderer draws into Shadow DOM. The tests check which patch it gets.
vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch, options }: { patch: string; options?: { diffStyle?: string } }) => (
    <pre
      data-testid="patch"
      data-style={options?.diffStyle}
      ref={(el) => {
        if (el) (el as unknown as { options: unknown }).options = options
      }}
    >
      {patch}
    </pre>
  ),
}))
// The agent panel has its own tests. Here it only shows the focus label.
vi.mock('@/components/agent/agent-panel', () => ({ AgentPanel: () => <aside>agent</aside> }))

const source: LoadedSource = {
  kind: 'pr',
  repo: 'o/r',
  title: 'Add retry',
  body: '',
  prUrl: 'https://github.com/o/r/pull/1',
  baseSha: 'b',
  headSha: 'h',
  dirtyHash: null,
  files: parseDiff(`diff --git a/src/client.ts b/src/client.ts
--- a/src/client.ts
+++ b/src/client.ts
@@ -10 +10 @@
-call()
+retry(call)
diff --git a/src/retry.ts b/src/retry.ts
new file mode 100644
--- /dev/null
+++ b/src/retry.ts
@@ -0,0 +1 @@
+export const retry = (f: () => void) => f()
`),
}

const summary: Summary = {
  overview: 'The change adds retry to the client.',
  goals: [
    {
      id: 'g1',
      kind: 'model',
      title: 'Retry failed calls',
      description: 'Calls fail sometimes.',
      changes: [
        {
          id: 'g1.c1',
          title: 'Wrap the call',
          description: 'The client calls retry.',
          hunkIds: ['h1'],
          kind: 'feature',
        },
        {
          id: 'g1.c2',
          title: 'Add the retry helper',
          description: 'A new helper.',
          hunkIds: ['h2'],
          kind: 'refactor',
        },
      ],
    },
  ],
  hunkNotes: { h1: 'The client calls the API through retry.', h2: 'The helper runs the function.' },
}

function fakeBridge(): SpiffyBridge {
  return {
    loadSource: vi.fn(async () => ({ sessionId: 's1', source })),
    summarize: vi.fn(async () => summary),
    chat: vi.fn(() => () => {}),
    checkSource: vi.fn(async () => false),
    rerunChange: vi.fn(() => () => {}),
    pickRepoFolder: vi.fn(async () => null),
    listBranches: vi.fn(async () => ({ current: 'main', branches: ['main'] })),
    linkRepo: vi.fn(async () => {}),
    simplify: vi.fn(() => () => {}),
    explainTerm: vi.fn(() => () => {}),
    explanations: vi.fn(async () => ({})),
  }
}

async function openPr() {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByPlaceholderText(/github.com/), 'https://github.com/o/r/pull/1')
  await user.click(screen.getByRole('button', { name: 'Explain' }))
  await screen.findByText('The change adds retry to the client.')
  return user
}

beforeEach(() => {
  window.spiffy = fakeBridge()
  localStorage.clear()
})

describe('the summary', () => {
  it('shows the goals of a PR after it loads', async () => {
    await openPr()

    expect(screen.getByRole('button', { name: /Retry failed calls/ })).toBeTruthy()
    expect(window.spiffy.summarize).toHaveBeenCalledWith(
      's1',
      'claude',
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('drills in from a goal to a change and shows only the code of that change', async () => {
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))

    await screen.findAllByTestId('patch')
    // Patches render one after the other. Wait until the last one can appear.
    await new Promise((r) => setTimeout(r, 600))
    const patches = screen.getAllByTestId('patch')
    expect(patches).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'src/retry.ts' })).toBeNull()
    expect(patches[0]!.textContent).toContain('+retry(call)')
    expect(patches[0]!.textContent).not.toContain('export const retry')
  })

  it('drills out one level when you press Escape', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))
    await screen.findAllByTestId('patch')

    await user.keyboard('{Escape}')

    expect(await screen.findByRole('button', { name: /Add the retry helper/ })).toBeTruthy()
    // jsdom does not end Motion exit animations, so the old level stays in the DOM.
    // The breadcrumb shows where you are.
    await waitFor(() =>
      expect(within(screen.getByRole('navigation')).queryByText('Wrap the call')).toBeNull(),
    )
  })

  it('goes back to a level when you click its breadcrumb', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await screen.findByRole('button', { name: /Wrap the call/ })

    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Overview' }),
    )

    expect(await screen.findByRole('button', { name: /Retry failed calls/ })).toBeTruthy()
  })
})

describe('hunk notes', () => {
  it('shows the note of each hunk beside its code in a change', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))

    const note = await screen.findByText('The client calls the API through retry.')
    // The diff renders after the zoom animation.
    await vi.waitFor(() =>
      expect(
        note.closest('[data-hunk]')?.querySelector('[data-testid=patch]')?.textContent,
      ).toContain('+retry(call)'),
    )
    expect(screen.queryByText('The helper runs the function.')).toBeNull()
  })

  it('shows the note of each hunk in the files view', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: 'files' }))
    await user.click(await screen.findByRole('button', { name: /retry\.ts/ }))

    expect(await screen.findByText('The helper runs the function.')).toBeTruthy()
  })
})

describe('the summary progress', () => {
  it('shows real progress while the agent reads the code', async () => {
    let finish: (s: Summary) => void = () => {}
    window.spiffy.summarize = vi.fn((_id, _backend, _onPartial, onProgress) => {
      onProgress?.({
        plan: 'single',
        phase: 'reading',
        done: 6,
        total: 0,
        activity: 'Reading src/client.ts',
      })
      return new Promise<Summary>((r) => (finish = r))
    })
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByPlaceholderText(/github.com/), 'https://github.com/o/r/pull/1')
    await user.click(screen.getByRole('button', { name: 'Explain' }))

    expect(
      await screen.findByText('The agent reads the code: 6 steps · Reading src/client.ts'),
    ).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Summary progress' }).getAttribute('aria-valuenow'),
    ).toBe('35')
    finish(summary)
    expect(await screen.findByText('The change adds retry to the client.')).toBeTruthy()
    await vi.waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  })
})

describe('drilling out', () => {
  it('goes up one level with the Back button', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))

    await user.click(screen.getByRole('button', { name: 'Back' }))

    await vi.waitFor(() =>
      expect(within(screen.getByRole('navigation')).queryByText('Wrap the call')).toBeNull(),
    )
    expect(within(screen.getByRole('navigation')).getByText('Retry failed calls')).toBeTruthy()
  })

  it('has no Back button at the top level', async () => {
    await openPr()

    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('goes up one level with Cmd+[', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await screen.findByRole('button', { name: /Wrap the call/ })

    await user.keyboard('{Meta>}[[{/Meta}')

    await vi.waitFor(() =>
      expect(within(screen.getByRole('navigation')).queryByText('Retry failed calls')).toBeNull(),
    )
  })
})

describe('opening a new source', () => {
  it('ignores a summary that arrives late for a source that you closed', async () => {
    const other: LoadedSource = {
      ...source,
      title: 'Second PR',
      prUrl: 'https://github.com/o/r/pull/2',
    }
    let finishFirst: (s: Summary) => void = () => {}
    window.spiffy.loadSource = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: 's1', source })
      .mockResolvedValueOnce({ sessionId: 's2', source: other })
    window.spiffy.summarize = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Summary>((r) => (finishFirst = r)))
      .mockImplementationOnce(() => new Promise<Summary>(() => {}))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByPlaceholderText(/github.com/), 'https://github.com/o/r/pull/1')
    await user.click(screen.getByRole('button', { name: 'Explain' }))
    await screen.findByRole('heading', { name: 'Add retry' })

    await user.click(screen.getByRole('button', { name: 'Change PR' }))
    await user.type(
      await screen.findByPlaceholderText(/github.com/),
      'https://github.com/o/r/pull/2',
    )
    await user.click(screen.getByRole('button', { name: 'Explain' }))
    await screen.findByRole('heading', { name: 'Second PR' })
    finishFirst(summary)

    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('button', { name: /Retry failed calls/ })).toBeNull()
  })
})

describe('arrow keys', () => {
  it('moves through the goals and changes, drills in and out, and shows the highlight', async () => {
    const user = await openPr()

    await user.keyboard('{ArrowDown}')
    expect(
      screen.getByRole('button', { name: /Retry failed calls/ }).getAttribute('aria-current'),
    ).toBe('true')

    await user.keyboard('{ArrowRight}')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Retry failed calls' }),
    ).toBeTruthy()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Wrap the call' })).toBeTruthy()

    await user.keyboard('{ArrowLeft}')
    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Wrap the call/ }).getAttribute('aria-current'),
      ).toBe('true'),
    )
  })

  it('does not move while you type in a text box', async () => {
    const user = await openPr()
    const box = document.body.appendChild(document.createElement('input'))
    box.focus()

    await user.keyboard('{ArrowDown}')
    box.remove()

    expect(
      screen.getByRole('button', { name: /Retry failed calls/ }).getAttribute('aria-current'),
    ).toBeNull()
  })
})

describe('new versions of the source', () => {
  const atChange = {
    request: { kind: 'pr', url: 'https://github.com/o/r/pull/1' },
    nav: {
      mode: 'summary',
      path: { level: 'change', goalId: 'g1', changeId: 'g1.c1' },
      file: null,
      direction: 1,
      cursor: null,
    },
  }

  async function openAtChange() {
    localStorage.setItem('spiffy.last', JSON.stringify(atChange))
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Wrap the call' })
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('checks every minute while the window has the focus, and offers a reload that keeps the place', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const bridge = window.spiffy
    await openAtChange()
    bridge.checkSource = vi.fn(async () => true)

    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS))

    expect(bridge.checkSource).toHaveBeenCalledWith('s1')
    const banner = await screen.findByRole('status', { name: 'New version' })
    expect(banner.textContent).toContain('This PR has new commits.')
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(within(banner).getByRole('button', { name: 'Reload' }))

    await vi.waitFor(() => expect(bridge.loadSource).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { level: 1, name: 'Wrap the call' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'New version' })).toBeNull()
  })

  it('does not check while the window does not have the focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    await openAtChange()

    await act(() => vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3))

    expect(window.spiffy.checkSource).not.toHaveBeenCalled()
  })

  it('checks when the window gets the focus again', async () => {
    await openAtChange()
    window.spiffy.checkSource = vi.fn(async () => true)

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(await screen.findByRole('status', { name: 'New version' })).toBeTruthy()
  })

  it('shows no banner when the source did not change', async () => {
    await openAtChange()

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await vi.waitFor(() => expect(window.spiffy.checkSource).toHaveBeenCalled())
    expect(screen.queryByRole('status', { name: 'New version' })).toBeNull()
  })
})

describe('resuming', () => {
  it('never shows the start screen while it opens the last source', async () => {
    localStorage.setItem(
      'spiffy.last',
      JSON.stringify({
        request: { kind: 'pr', url: 'https://github.com/o/r/pull/1' },
        nav: { mode: 'summary', path: { level: 'source' }, file: null, direction: 1, cursor: null },
      }),
    )
    let finish: () => void = () => {}
    window.spiffy.loadSource = vi.fn(
      () =>
        new Promise<{ sessionId: string; source: LoadedSource }>(
          (r) => (finish = () => r({ sessionId: 's1', source })),
        ),
    )

    render(<App />)

    expect(screen.queryByPlaceholderText(/github.com/)).toBeNull()
    expect(screen.getByRole('status', { name: 'Reopening' }).textContent).toContain(
      'github.com/o/r/pull/1',
    )
    act(() => finish())
    expect(await screen.findByRole('heading', { level: 1, name: 'Add retry' })).toBeTruthy()
    expect(screen.queryByPlaceholderText(/github.com/)).toBeNull()
  })

  it('shows the start screen with the error when the last source does not open', async () => {
    localStorage.setItem(
      'spiffy.last',
      JSON.stringify({
        request: { kind: 'pr', url: 'https://github.com/o/r/pull/1' },
        nav: { mode: 'summary', path: { level: 'source' }, file: null, direction: 1, cursor: null },
      }),
    )
    window.spiffy.loadSource = vi.fn(async () => {
      throw new Error('gh: not logged in')
    })

    render(<App />)

    expect(await screen.findByPlaceholderText(/github.com/)).toBeTruthy()
    expect(await screen.findByText(/not logged in/)).toBeTruthy()
  })

  it('opens the last source at the change where you left it', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))
    await screen.findByRole('heading', { name: 'Wrap the call' })
    cleanup()

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Wrap the call' })).toBeTruthy()
    expect(window.spiffy.loadSource).toHaveBeenLastCalledWith({
      kind: 'pr',
      url: 'https://github.com/o/r/pull/1',
    })
  })

  it('opens the overview when the saved change is not in the new summary', async () => {
    localStorage.setItem(
      'spiffy.last',
      JSON.stringify({
        request: { kind: 'pr', url: 'https://github.com/o/r/pull/1' },
        nav: {
          mode: 'summary',
          path: { level: 'change', goalId: 'g9', changeId: 'g9.c1' },
          file: null,
        },
      }),
    )

    render(<App />)

    expect(await screen.findByRole('button', { name: /Retry failed calls/ })).toBeTruthy()
  })

  it('shows the start screen after you close the source', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: 'Change PR' }))
    await screen.findByPlaceholderText(/github.com/)
    cleanup()

    render(<App />)

    expect(await screen.findByPlaceholderText(/github.com/)).toBeTruthy()
    expect(window.spiffy.loadSource).toHaveBeenCalledTimes(1)
  })
})

describe('the files view', () => {
  it('lists every file and links each hunk to its change', async () => {
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'files' }))
    expect(await screen.findByRole('button', { name: /retry\.ts/ })).toBeTruthy()
    await user.click(
      await screen.findByRole('button', { name: 'Retry failed calls › Wrap the call' }),
    )

    expect(await screen.findByRole('heading', { name: 'Wrap the call' })).toBeTruthy()
  })
})

describe('the source title', () => {
  it('stays on one line with the full title on hover, and does not animate', async () => {
    await openPr()

    const title = screen.getByRole('heading', { level: 1, name: 'Add retry' })
    expect(title.className).toContain('truncate')
    expect(title.getAttribute('title')).toBe('Add retry')
    // The page still slides as a whole when you drill. The title has no animation of its own.
    for (const el of [title, title.parentElement!]) {
      expect(el.style.opacity).toBe('')
      expect(el.style.transform).toBe('')
    }
  })
})

describe('the agent panel toggle', () => {
  const panel = () => screen.getByText('agent').closest('[data-agent-panel]')!

  it('starts closed, and opens and closes with the Agent button', async () => {
    const user = await openPr()
    const button = screen.getByRole('button', { name: 'Agent' })

    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(panel().hasAttribute('hidden')).toBe(true)

    await user.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(panel().hasAttribute('hidden')).toBe(false)

    await user.click(button)
    expect(panel().hasAttribute('hidden')).toBe(true)
  })

  it('remembers that you opened it', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: 'Agent' }))
    cleanup()
    localStorage.removeItem('spiffy.last')

    await openPr()

    expect(panel().hasAttribute('hidden')).toBe(false)
  })
})

describe('change kinds', () => {
  it('shows the kind of each change in the list and on the change page', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))

    const wrap = await screen.findByRole('button', { name: /Wrap the call/ })
    expect(within(wrap).getByText('New functionality')).toBeTruthy()
    expect(
      within(screen.getByRole('button', { name: /Add the retry helper/ })).getByText('Refactor'),
    ).toBeTruthy()

    await user.click(wrap)
    const header = (
      await screen.findByRole('heading', { level: 1, name: 'Wrap the call' })
    ).closest('header')!
    expect(within(header).getByText('New functionality')).toBeTruthy()
  })
})

describe('change notes', () => {
  function rerunWith() {
    const runs: { req: RerunRequest; h: StreamHandlers<RerunEvent> }[] = []
    window.spiffy.rerunChange = vi.fn((req, h) => {
      runs.push({ req, h })
      return () => {}
    })
    const last = () => runs.at(-1)!.h
    return {
      runs,
      send: (e: RerunEvent) => act(() => last().onChunk(e)),
      end: () => act(() => last().onEnd()),
      fail: (m: string) => act(() => last().onError(m)),
    }
  }

  async function openChange(s: Summary = summary) {
    window.spiffy.summarize = vi.fn(async () => s)
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))
    await screen.findByRole('heading', { level: 1, name: 'Wrap the call' })
    return user
  }

  const explained: Summary = {
    ...summary,
    detailed: ['g1.c1'],
    hunkNotes: { ...summary.hunkNotes, h1: 'Calls fail in bursts, so the client retries them.' },
    blockNotes: { 'h1.b1': 'Calls the API one time.', 'h1.b2': 'Calls the API through retry.' },
  }

  type Hover = {
    annotationSide: string
    lineNumber: number
    lineType: string
    lineElement: HTMLElement
  }
  async function patchOptions() {
    const el = await screen.findByTestId('patch')
    return (
      el as unknown as {
        options: { onLineEnter: (p: Hover) => void; onLineLeave: (p: Hover) => void }
      }
    ).options
  }
  const line = (annotationSide: string, lineNumber: number, lineType: string): Hover => ({
    annotationSide,
    lineNumber,
    lineType,
    lineElement: document.body,
  })

  it('writes the why notes the first time a change shows, and shows them in the margin', async () => {
    const run = rerunWith()
    await openChange()

    expect(window.spiffy.rerunChange).toHaveBeenCalledWith(
      { sessionId: 's1', backend: 'claude', goalId: 'g1', changeId: 'g1.c1', mode: 'detail' },
      expect.anything(),
    )
    expect((await screen.findByRole('status', { name: 'Why note' })).textContent).toContain(
      'Finding why',
    )

    await run.send({
      type: 'done',
      hunkNotes: { h1: 'Calls fail in bursts, so the client retries them.' },
      blockNotes: {},
    })
    await run.end()

    expect(
      await screen.findByText('Calls fail in bursts, so the client retries them.'),
    ).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Why note' })).toBeNull()
  })

  it('does not write the notes again when the summary has them', async () => {
    rerunWith()
    await openChange(explained)

    expect(
      await screen.findByText('Calls fail in bursts, so the client retries them.'),
    ).toBeTruthy()
    expect(window.spiffy.rerunChange).not.toHaveBeenCalled()
  })

  it('explains red lines with BEFORE and green lines with NOW in a popover when you hover them', async () => {
    rerunWith()
    await openChange(explained)
    const options = await patchOptions()

    act(() => options.onLineEnter(line('deletions', 10, 'change-deletion')))
    expect((await screen.findByRole('tooltip')).textContent).toBe('BEFORE: Calls the API one time.')

    act(() => options.onLineEnter(line('additions', 10, 'change-addition')))
    await vi.waitFor(() =>
      expect(screen.getByRole('tooltip').textContent).toBe('NOW: Calls the API through retry.'),
    )

    act(() => options.onLineLeave(line('additions', 10, 'change-addition')))
    await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())
  })

  it('shows no popover on a context line', async () => {
    rerunWith()
    await openChange(explained)
    const options = await patchOptions()

    act(() => options.onLineEnter(line('additions', 3, 'context')))

    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('tells in the popover that the agent still explains the code', async () => {
    rerunWith()
    await openChange()
    const options = await patchOptions()

    act(() => options.onLineEnter(line('additions', 10, 'change-addition')))

    expect((await screen.findByRole('tooltip')).textContent).toContain('NOW:')
    expect(screen.getByRole('tooltip').textContent).toContain('The agent explains this code')
  })

  it('reruns the change: shows what the agent reads, then the new text', async () => {
    const run = rerunWith()
    const user = await openChange(explained)

    await user.click(screen.getByRole('button', { name: 'Rerun this change' }))

    expect(run.runs.at(-1)!.req).toEqual({
      sessionId: 's1',
      backend: 'claude',
      goalId: 'g1',
      changeId: 'g1.c1',
      mode: 'rerun',
    })
    expect(screen.getByRole('button', { name: 'Rerun this change' }).hasAttribute('disabled')).toBe(
      true,
    )
    await run.send({ type: 'activity', text: 'Reading src/retry.ts' })
    expect(screen.getByRole('status', { name: 'Rerun' }).textContent).toContain(
      'Reading src/retry.ts',
    )

    await run.send({
      type: 'done',
      title: 'Add a backoff',
      description: 'The retry waits.',
      hunkNotes: { h1: 'Waits between tries.' },
      blockNotes: {},
    })
    await run.end()

    expect(await screen.findByRole('heading', { level: 1, name: 'Add a backoff' })).toBeTruthy()
    expect(await screen.findByText('Waits between tries.')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Rerun' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Rerun this change' }).hasAttribute('disabled')).toBe(
      false,
    )
  })

  it('shows the error and keeps the old change when the rerun fails', async () => {
    const run = rerunWith()
    const user = await openChange(explained)
    await user.click(screen.getByRole('button', { name: 'Rerun this change' }))

    await run.fail('rate limit')

    expect(await screen.findByText(/rate limit/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Wrap the call' })).toBeTruthy()
  })
})

describe('the diff style', () => {
  const styles = () => screen.getAllByTestId('patch').map((p) => p.getAttribute('data-style'))

  it('shows the diffs of a change side by side when you pick Split, and keeps the choice everywhere', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await user.click(await screen.findByRole('button', { name: /Wrap the call/ }))
    await vi.waitFor(() => expect(styles()).toEqual(expect.arrayContaining(['unified'])))

    await user.click(screen.getByRole('radio', { name: 'Split' }))

    await vi.waitFor(() => expect(new Set(styles())).toEqual(new Set(['split'])))
    await user.click(screen.getByRole('button', { name: 'files' }))
    await vi.waitFor(() => expect(new Set(styles())).toEqual(new Set(['split'])))
    expect(localStorage.getItem('spiffy.diffStyle')).toBe('split')
  })

  it('starts with the style that you picked last time', async () => {
    localStorage.setItem('spiffy.diffStyle', 'split')
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'files' }))

    await vi.waitFor(() => expect(new Set(styles())).toEqual(new Set(['split'])))
  })
})

describe('the local copy', () => {
  it('uses a folder that you select as the workspace of a PR', async () => {
    window.spiffy.pickRepoFolder = vi.fn(async () => '/code/r')
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Use a local copy' }))

    expect(window.spiffy.linkRepo).toHaveBeenCalledWith('s1', '/code/r')
    expect(await screen.findByTitle('Local copy: /code/r')).toBeTruthy()
  })

  it('shows why spiffy-diff refuses a folder', async () => {
    window.spiffy.pickRepoFolder = vi.fn(async () => '/code/x')
    window.spiffy.linkRepo = vi.fn(async () => {
      throw new Error(
        "Error invoking remote method 'repo:link': Error: The folder /code/x is a copy of a/b, not o/r.",
      )
    })
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Use a local copy' }))

    expect(await screen.findByText('The folder /code/x is a copy of a/b, not o/r.')).toBeTruthy()
  })
})
