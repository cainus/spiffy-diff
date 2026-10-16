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
}

function fakeBridge(): SpiffyBridge {
  return {
    loadSource: vi.fn(async () => ({ sessionId: 's1', source })),
    summarize: vi.fn(async () => summary),
    chat: vi.fn(() => () => {}),
    pickRepoFolder: vi.fn(async () => null),
    listBranches: vi.fn(async () => ({ current: 'main', branches: ['main'] })),
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
