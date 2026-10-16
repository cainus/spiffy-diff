import type { UIMessageChunk } from 'ai'
import { describe, expect, it } from 'vitest'
import type { ChatTurnRequest, SpiffyBridge, StreamHandlers } from '@shared/ipc'
import { ContextBox, IpcChatTransport } from './ipc-transport'

type ChatFn = SpiffyBridge['chat']

function bridge(chat: ChatFn): Pick<SpiffyBridge, 'chat'> {
  return { chat }
}

async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const out: UIMessageChunk[] = []
  for await (const c of stream) out.push(c)
  return out
}

const base = { trigger: 'submit-message' as const, chatId: 'c', messageId: undefined, messages: [] }

describe('IpcChatTransport', () => {
  it('sends the session, backend, and focus, and streams the chunks from main', async () => {
    let seen: ChatTurnRequest | undefined
    const transport = new IpcChatTransport(
      bridge((req, h) => {
        seen = req
        queueMicrotask(() => {
          h.onChunk({ type: 'text-start', id: 't' })
          h.onChunk({ type: 'text-delta', id: 't', delta: 'hi' })
          h.onEnd()
        })
        return () => {}
      }),
      () => ({ sessionId: 's1', backend: 'codex', focus: { level: 'source' } }),
    )

    const chunks = await collect(await transport.sendMessages({ ...base, abortSignal: undefined }))

    expect(seen).toMatchObject({ sessionId: 's1', backend: 'codex', focus: { level: 'source' } })
    expect(chunks.map((c) => c.type)).toEqual(['text-start', 'text-delta'])
  })

  it('turns an error from main into a stream error', async () => {
    const transport = new IpcChatTransport(
      bridge((_req, h) => {
        queueMicrotask(() => h.onError('Claude is not logged in'))
        return () => {}
      }),
      () => ({ sessionId: 's1', backend: 'claude', focus: { level: 'source' } }),
    )

    await expect(
      collect(await transport.sendMessages({ ...base, abortSignal: undefined })),
    ).rejects.toThrow('Claude is not logged in')
  })

  it('cancels the request in main when the chat aborts', async () => {
    let cancelled = false
    let handlers: StreamHandlers<UIMessageChunk> | undefined
    const transport = new IpcChatTransport(
      bridge((_req, h) => {
        handlers = h
        return () => {
          cancelled = true
        }
      }),
      () => ({ sessionId: 's1', backend: 'claude', focus: { level: 'source' } }),
    )
    const abort = new AbortController()

    const stream = await transport.sendMessages({ ...base, abortSignal: abort.signal })
    abort.abort()

    expect(cancelled).toBe(true)
    expect(handlers).toBeDefined()
    await expect(collect(stream)).resolves.toEqual([])
  })
})

describe('ContextBox', () => {
  it('returns the last context that was set', () => {
    const box = new ContextBox()
    box.set({ sessionId: 's9', backend: 'codex', focus: { level: 'file', path: 'a.ts' } })

    expect(box.get()).toEqual({
      sessionId: 's9',
      backend: 'codex',
      focus: { level: 'file', path: 'a.ts' },
    })
  })
})
