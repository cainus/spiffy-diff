import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import type { Focus } from '@shared/focus'
import type { SpiffyBridge } from '@shared/ipc'
import type { Backend } from '@shared/source'

export interface TurnContext {
  sessionId: string
  backend: Backend
  focus: Focus
}

/**
 * A `useChat` transport that sends each turn to the main process over IPC.
 * `context` is read at send time, so each message carries the current focus.
 */
export class IpcChatTransport implements ChatTransport<UIMessage> {
  constructor(
    private readonly bridge: Pick<SpiffyBridge, 'chat'>,
    private readonly context: () => TurnContext,
  ) {}

  async sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = options
    let cancel = (): void => {}
    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        let open = true
        const close = (fn: () => void): void => {
          if (!open) return
          open = false
          fn()
        }
        cancel = this.bridge.chat(
          { ...this.context(), messages },
          {
            onChunk: (chunk) => open && controller.enqueue(chunk),
            onEnd: () => close(() => controller.close()),
            onError: (message) => close(() => controller.error(new Error(message))),
          },
        )
        abortSignal?.addEventListener('abort', () => {
          cancel()
          close(() => controller.close())
        })
      },
      cancel: () => cancel(),
    })
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
