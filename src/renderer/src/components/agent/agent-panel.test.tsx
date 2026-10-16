// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDiff } from '@shared/diff'
import type { SpiffyBridge } from '@shared/ipc'
import type { LoadedSource } from '@shared/source'
import type { Summary } from '@shared/summary'
import type { TermEvent } from '@shared/terms'
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
    explainTerm: vi.fn(() => () => {}),
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
  function explainWith(answers: Record<string, TermEvent[]>) {
    const pending: Record<string, () => void> = {}
    bridge.explainTerm = vi.fn((req, h) => {
      const events = answers[req.term.term] ?? []
      pending[req.term.term] = () => {
        for (const e of events) h.onChunk(e)
        h.onEnd()
      }
      return () => {}
    })
    return (term: string) => act(() => pending[term]!())
  }

  it('explains a term in a popup with a progress indicator, not in the agent panel', async () => {
    const finish = explainWith({
      client: [
        { type: 'activity', text: 'Reading src/client.ts' },
        { type: 'text', delta: 'The client sends [[HTTP|jargon]] calls.' },
      ],
    })
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Ask about the code concept client' }))

    const popup = await screen.findByRole('dialog', { name: 'client' })
    expect(within(popup).getByRole('status').textContent).toContain('The agent reads the code')
    finish('client')
    await vi.waitFor(() => expect(popup.textContent).toContain('The client sends HTTP calls.'))
    expect(within(popup).queryByRole('status')).toBeNull()
    expect(bridge.explainTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        backend: 'claude',
        term: { term: 'client', kind: 'code' },
        context: 'The change adds retry to the client.',
      }),
      expect.anything(),
    )
    expect(bridge.chat).not.toHaveBeenCalled()
  })

  it('shows the same explanation at once when you open the term again', async () => {
    const finish = explainWith({ client: [{ type: 'text', delta: 'The client sends calls.' }] })
    const user = await openPr()
    const word = screen.getByRole('button', { name: 'Ask about the code concept client' })
    await user.click(word)
    finish('client')
    await vi.waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'client' }).textContent).toContain(
        'The client sends calls.',
      ),
    )

    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(word)

    expect((await screen.findByRole('dialog', { name: 'client' })).textContent).toContain(
      'The client sends calls.',
    )
    expect(bridge.explainTerm).toHaveBeenCalledTimes(1)
  })

  it('shows what the agent reads while it works', async () => {
    explainWith({ client: [] })
    bridge.explainTerm = vi.fn((_req, h) => {
      queueMicrotask(() => h.onChunk({ type: 'activity', text: 'Reading src/client.ts' }))
      return () => {}
    })
    const user = await openPr()

    await user.click(screen.getByRole('button', { name: 'Ask about the code concept client' }))

    const popup = await screen.findByRole('dialog', { name: 'client' })
    await vi.waitFor(() =>
      expect(within(popup).getByRole('status').textContent).toContain('Reading src/client.ts'),
    )
  })

  it('underlines terms in the popup, and explains them in the same popup with a way back', async () => {
    const finish = explainWith({
      client: [{ type: 'text', delta: 'The client sends [[HTTP|jargon]] calls.' }],
      HTTP: [{ type: 'text', delta: 'HTTP is how programs talk on the web.' }],
    })
    const user = await openPr()
    await user.click(screen.getByRole('button', { name: 'Ask about the code concept client' }))
    const popup = await screen.findByRole('dialog', { name: 'client' })
    finish('client')

    await user.click(
      await within(popup).findByRole('button', { name: 'Ask about the technical term HTTP' }),
    )
    finish('HTTP')

    const inner = await screen.findByRole('dialog', { name: 'HTTP' })
    await vi.waitFor(() =>
      expect(inner.textContent).toContain('HTTP is how programs talk on the web.'),
    )
    expect(bridge.explainTerm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        term: { term: 'HTTP', kind: 'jargon' },
        context: 'The client sends HTTP calls.',
      }),
      expect.anything(),
    )

    await user.click(within(inner).getByRole('button', { name: 'Back to client' }))

    const back = await screen.findByRole('dialog', { name: 'client' })
    expect(back.textContent).toContain('The client sends HTTP calls.')
    expect(bridge.explainTerm).toHaveBeenCalledTimes(2)
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
