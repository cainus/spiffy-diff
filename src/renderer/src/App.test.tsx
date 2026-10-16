// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { SpiffyBridge } from '@shared/ipc'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { App } from './App'

// The diff renderer draws into Shadow DOM. The tests check which patch it gets.
vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch">{patch}</pre>,
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
        },
        {
          id: 'g1.c2',
          title: 'Add the retry helper',
          description: 'A new helper.',
          hunkIds: ['h2'],
        },
      ],
    },
  ],
}

function fakeBridge(): SpiffyBridge {
  return {
    loadSource: vi.fn(async () => ({ sessionId: 's1', source })),
    summarize: vi.fn(async () => summary),
    chat: vi.fn(() => () => {}),
    pickRepoFolder: vi.fn(async () => null),
    listBranches: vi.fn(async () => ({ current: 'main', branches: ['main'] })),
    linkRepo: vi.fn(async () => {}),
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
    expect(window.spiffy.summarize).toHaveBeenCalledWith('s1', 'claude', expect.any(Function))
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

describe('the local copy', () => {
  it('uses a folder that you select as the workspace of a PR', async () => {
    window.spiffy.pickRepoFolder = vi.fn(async () => '/code/r')
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Use a local copy' }))

    expect(window.spiffy.linkRepo).toHaveBeenCalledWith('s1', '/code/r')
    expect(await screen.findByTitle('Local copy: /code/r')).toBeTruthy()
  })

  it('shows why spiffy refuses a folder', async () => {
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
