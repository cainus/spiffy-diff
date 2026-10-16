// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
    explanations: vi.fn(async () => ({})),
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

describe('agent activity', () => {
  function chatWith() {
    let send: (c: unknown) => void = () => {}
    let end: () => void = () => {}
    bridge.chat = vi.fn((_req, h) => {
      send = (c) => h.onChunk(c as never)
      end = h.onEnd
      return () => {}
    })
    return { send: (c: unknown) => act(() => send(c)), end: () => act(() => end()) }
  }

  async function ask() {
    const user = await openPr()
    ;(await screen.findByPlaceholderText('Ask a question…')).focus()
    await user.keyboard('Why?')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    await vi.waitFor(() => expect(bridge.chat).toHaveBeenCalled())
    return user
  }

  const status = () => within(screen.getByRole('log')).queryByRole('status')

  it('shows that the agent thinks after the stream starts and before any text', async () => {
    const chat = chatWith()
    await ask()

    await chat.send({ type: 'start', messageId: 'a1' })
    await chat.send({ type: 'start-step' })

    expect(status()?.textContent).toContain('The agent thinks')
  })

  it('shows the tool that the agent uses, with a short path', async () => {
    const chat = chatWith()
    await ask()
    await chat.send({ type: 'start', messageId: 'a1' })

    await chat.send({
      type: 'tool-input-available',
      toolCallId: 't1',
      toolName: 'Read',
      input: { file_path: '/Users/me/.spiffy/worktrees/o__r-abc123/src/client.ts' },
      dynamic: true,
      providerExecuted: true,
    })
    expect(status()?.textContent).toContain('Reading src/client.ts')

    await chat.send({
      type: 'tool-input-available',
      toolCallId: 't2',
      toolName: 'Grep',
      input: { pattern: 'withRetry' },
      dynamic: true,
      providerExecuted: true,
    })
    expect(status()?.textContent).toContain('Searching for withRetry')
  })

  it('hides the indicator while text streams, and after the answer ends', async () => {
    const chat = chatWith()
    await ask()
    await chat.send({ type: 'start', messageId: 'a1' })
    await chat.send({ type: 'text-start', id: 't' })
    await chat.send({ type: 'text-delta', id: 't', delta: 'Because.' })

    expect(status()).toBeNull()

    await chat.send({ type: 'text-end', id: 't' })
    await chat.send({ type: 'finish' })
    await chat.end()
    await vi.waitFor(() => expect(status()).toBeNull())
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

describe('explaining a selection', () => {
  function explainWith(answers: Record<string, TermEvent[]>) {
    const pending: Record<string, () => void> = {}
    bridge.explainTerm = vi.fn((req, h) => {
      const events = answers[req.phrase] ?? []
      pending[req.phrase] = () => {
        for (const e of events) h.onChunk(e)
        h.onEnd()
      }
      return () => {}
    })
    return (phrase: string) => act(() => pending[phrase]!())
  }

  function select(container: HTMLElement, phrase: string) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(phrase)
      if (at === -1) continue
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + phrase.length)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      fireEvent.mouseUp(node.parentElement!)
      return
    }
    throw new Error(`"${phrase}" is not in the container`)
  }

  const overview = () =>
    screen.getByText(
      (_, el) => el?.tagName === 'P' && el.textContent === 'The change adds retry to the client.',
    )

  it('explains selected text in a popup with a progress indicator, not in the agent panel', async () => {
    const finish = explainWith({
      retry: [
        { type: 'activity', text: 'Reading src/client.ts' },
        { type: 'text', delta: 'Retry runs a failed call again.' },
      ],
    })
    const user = await openPr()

    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))

    const popup = await screen.findByRole('dialog', { name: 'retry' })
    await vi.waitFor(() => expect(within(popup).getByRole('status')).toBeTruthy())
    finish('retry')
    await vi.waitFor(() => expect(popup.textContent).toContain('Retry runs a failed call again.'))
    expect(within(popup).queryByRole('status')).toBeNull()
    expect(bridge.explainTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        backend: 'claude',
        phrase: 'retry',
        context: 'The change adds retry to the client.',
      }),
      expect.anything(),
    )
    expect(bridge.chat).not.toHaveBeenCalled()
  })

  it('shows what the agent reads while it works', async () => {
    bridge.explainTerm = vi.fn((_req, h) => {
      queueMicrotask(() => h.onChunk({ type: 'activity', text: 'Reading src/client.ts' }))
      return () => {}
    })
    const user = await openPr()
    select(overview(), 'client')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))

    const popup = await screen.findByRole('dialog', { name: 'client' })
    await vi.waitFor(() =>
      expect(within(popup).getByRole('status').textContent).toContain('Reading src/client.ts'),
    )
  })

  it('underlines an explained phrase afterward, and a click shows the saved answer at once', async () => {
    const finish = explainWith({
      retry: [{ type: 'text', delta: 'Retry runs a failed call again.' }],
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('retry')
    await vi.waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('Retry runs'))
    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(await screen.findByRole('button', { name: 'Explain retry' }))

    expect((await screen.findByRole('dialog', { name: 'retry' })).textContent).toContain(
      'Retry runs a failed call again.',
    )
    expect(bridge.explainTerm).toHaveBeenCalledTimes(1)
  })

  it('underlines the explanations that were saved before', async () => {
    bridge.explanations = vi.fn(async () => ({
      client: { phrase: 'client', text: 'The client calls the API.' },
    }))
    const user = await openPr()

    await user.click(await screen.findByRole('button', { name: 'Explain client' }))

    expect((await screen.findByRole('dialog', { name: 'client' })).textContent).toContain(
      'The client calls the API.',
    )
    expect(bridge.explanations).toHaveBeenCalledWith('s1')
    expect(bridge.explainTerm).not.toHaveBeenCalled()
  })

  it('opens a popup on top when you select text in a popup, recursively, and keeps the lower popups', async () => {
    const finish = explainWith({
      retry: [{ type: 'text', delta: 'Retry uses backoff between calls.' }],
      backoff: [{ type: 'text', delta: 'Backoff adds jitter to the wait.' }],
      jitter: [{ type: 'text', delta: 'Jitter is a random part of the wait.' }],
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('retry')
    const first = await screen.findByRole('dialog', { name: 'retry' })
    await vi.waitFor(() => expect(first.textContent).toContain('backoff'))

    select(first, 'backoff')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('backoff')
    const second = await screen.findByRole('dialog', { name: 'backoff' })
    await vi.waitFor(() => expect(second.textContent).toContain('jitter'))

    select(second, 'jitter')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('jitter')
    const third = await screen.findByRole('dialog', { name: 'jitter' })
    await vi.waitFor(() =>
      expect(third.textContent).toContain('Jitter is a random part of the wait.'),
    )

    expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual([
      'retry',
      'backoff',
      'jitter',
    ])
    expect(bridge.explainTerm).toHaveBeenLastCalledWith(
      expect.objectContaining({ phrase: 'jitter', context: 'Backoff adds jitter to the wait.' }),
      expect.anything(),
    )

    await user.keyboard('{Escape}')
    await vi.waitFor(() =>
      expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual([
        'retry',
        'backoff',
      ]),
    )
  })

  it('closes the popups above a popup when you click in it', async () => {
    const finish = explainWith({
      retry: [{ type: 'text', delta: 'Retry uses backoff between calls.' }],
      backoff: [{ type: 'text', delta: 'Backoff waits longer each time.' }],
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('retry')
    const first = await screen.findByRole('dialog', { name: 'retry' })
    await vi.waitFor(() => expect(first.textContent).toContain('backoff'))
    select(first, 'backoff')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('backoff')
    await screen.findByRole('dialog', { name: 'backoff' })

    await user.click(within(first).getByText('retry'))

    await vi.waitFor(() =>
      expect(screen.getAllByRole('dialog').map((d) => d.getAttribute('aria-label'))).toEqual([
        'retry',
      ]),
    )
  })

  it('opens a saved phrase in a popup on top when you click it in a popup', async () => {
    bridge.explanations = vi.fn(async () => ({
      backoff: { phrase: 'backoff', text: 'Backoff waits longer each time.' },
    }))
    const finish = explainWith({
      retry: [{ type: 'text', delta: 'Retry uses backoff between calls.' }],
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('retry')
    const first = await screen.findByRole('dialog', { name: 'retry' })

    await user.click(await within(first).findByRole('button', { name: 'Explain backoff' }))

    expect((await screen.findByRole('dialog', { name: 'backoff' })).textContent).toContain(
      'Backoff waits longer',
    )
    expect(screen.getByRole('dialog', { name: 'retry' })).toBeTruthy()
  })

  it('shows `code` in an explanation as code, without the backticks', async () => {
    const finish = explainWith({
      retry: [{ type: 'text', delta: 'It calls `withRetry` on the client.' }],
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    finish('retry')

    const popup = await screen.findByRole('dialog', { name: 'retry' })
    await vi.waitFor(() => expect(popup.textContent).toContain('It calls withRetry on the client.'))
    expect(within(popup).getByText('withRetry').closest('code')).not.toBeNull()
  })

  it('explains the phrase again with the refresh button', async () => {
    let answer = 'First answer.'
    bridge.explainTerm = vi.fn((_req, h) => {
      const text = answer
      queueMicrotask(() => {
        h.onChunk({ type: 'text', delta: text })
        h.onEnd()
      })
      return () => {}
    })
    const user = await openPr()
    select(overview(), 'retry')
    await user.click(await screen.findByRole('button', { name: 'Explain selection' }))
    const popup = await screen.findByRole('dialog', { name: 'retry' })
    await vi.waitFor(() => expect(popup.textContent).toContain('First answer.'))

    answer = 'Second answer.'
    await user.click(within(popup).getByRole('button', { name: 'Explain again' }))

    await vi.waitFor(() => expect(popup.textContent).toContain('Second answer.'))
    expect(popup.textContent).not.toContain('First answer.')
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
