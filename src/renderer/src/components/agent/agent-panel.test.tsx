// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { SpiffyBridge } from '@shared/ipc'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import { App } from '@/App'

// The diff renderer draws into Shadow DOM. The tests check which patch it gets.
vi.mock('@pierre/diffs/react', () => ({
  PatchDiff: ({ patch }: { patch: string }) => <pre data-testid="patch">{patch}</pre>,
}))

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
  terms: [
    { term: 'retry', kind: 'jargon' },
    { term: 'client', kind: 'code' },
  ],
}

function fakeBridge(): SpiffyBridge {
  return {
    loadSource: vi.fn(async () => ({ sessionId: 's1', source })),
    summarize: vi.fn(async () => summary),
    chat: vi.fn(() => () => {}),
    pickRepoFolder: vi.fn(async () => null),
    listBranches: vi.fn(async () => ({ current: 'main', branches: ['main'] })),
    simplify: vi.fn(() => () => {}),
    linkRepo: vi.fn(async () => {}),
  }
}

async function openPr() {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByPlaceholderText(/github.com/), 'https://github.com/o/r/pull/1')
  await user.click(screen.getByRole('button', { name: 'Explain' }))
  // Terms split the overview into several elements. Match the whole paragraph.
  await screen.findByText(
    (_, el) => el?.tagName === 'P' && el.textContent === 'The change adds retry to the client.',
  )
  return user
}

let bridge: SpiffyBridge

beforeEach(() => {
  bridge = fakeBridge()
  bridge.chat = vi.fn((_req, h) => {
    queueMicrotask(() => {
      h.onChunk({ type: 'start', messageId: 'a1' })
      h.onChunk({ type: 'text-start', id: 't' })
      h.onChunk({ type: 'text-delta', id: 't', delta: 'The goal stops failed calls.' })
      h.onChunk({ type: 'text-end', id: 't' })
      h.onChunk({ type: 'finish' })
      h.onEnd()
    })
    return () => {}
  })
  window.spiffy = bridge
  localStorage.clear()
})

describe('the agent panel', () => {
  it('shows the focus and sends it with the question', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await screen.findByText('Goal: Retry failed calls')

    const box = screen.getByPlaceholderText('Ask a question…')
    box.focus()
    await user.keyboard('Why?')
    await user.click(screen.getByRole('button', { name: 'Submit' }))

    await vi.waitFor(() =>
      expect(bridge.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 's1',
          backend: 'claude',
          focus: { level: 'goal', goalId: 'g1' },
        }),
        expect.anything(),
      ),
    )
    await vi.waitFor(() =>
      expect(screen.getByRole('log').textContent).toContain('The goal stops failed calls.'),
    )
  })

  it('sends the file focus from the files view', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: 'files' }))
    await user.click(await screen.findByRole('button', { name: /retry\.ts/ }))

    await user.click(screen.getByRole('button', { name: 'Explain the changes in this file.' }))

    expect(bridge.chat).toHaveBeenCalledWith(
      expect.objectContaining({ focus: { level: 'file', path: 'src/retry.ts' } }),
      expect.anything(),
    )
    expect(
      within(screen.getByRole('log')).getByText('Explain the changes in this file.'),
    ).toBeTruthy()
  })
})

describe('drilling out from the agent box', () => {
  it('goes up one level with Escape while the agent box has the focus', async () => {
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: /Retry failed calls/ }))
    await screen.findByText('Goal: Retry failed calls')
    screen.getByPlaceholderText('Ask a question…').focus()

    await user.keyboard('{Escape}')

    expect(await screen.findByTitle('Overview')).toBeTruthy()
  })
})

describe('terms', () => {
  it('underlines terms in an explanation and asks the agent about a term you click', async () => {
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Ask about the code concept client' }))

    await vi.waitFor(() =>
      expect(bridge.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              parts: [
                {
                  type: 'text',
                  text: 'Explain the code concept "client" in this repository. Find where it is defined and what uses it.',
                },
              ],
            }),
          ],
        }),
        expect.anything(),
      ),
    )
  })
})

describe('ELI5', () => {
  it('explains the overview again as for a child, below the overview', async () => {
    bridge.simplify = vi.fn((_req, h) => {
      queueMicrotask(() => {
        h.onChunk('The app ')
        h.onChunk('tries again.')
        h.onEnd()
      })
      return () => {}
    })
    const user = await openPr()

    await user.click(screen.getAllByRole('button', { name: 'Explain like I am five' })[0]!)

    expect(await screen.findByText('The app tries again.')).toBeTruthy()
    expect(bridge.simplify).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        backend: 'claude',
        text: 'The change adds retry to the client.',
      }),
      expect.anything(),
    )
  })

  it('hides the simple explanation when you press the button again', async () => {
    bridge.simplify = vi.fn((_req, h) => {
      queueMicrotask(() => {
        h.onChunk('Simple.')
        h.onEnd()
      })
      return () => {}
    })
    const user = await openPr()
    const button = screen.getAllByRole('button', { name: 'Explain like I am five' })[0]!
    await user.click(button)
    await screen.findByText('Simple.')

    await user.click(button)

    await vi.waitFor(() => expect(screen.queryByText('Simple.')).toBeNull())
    expect(bridge.simplify).toHaveBeenCalledTimes(1)
  })
})
