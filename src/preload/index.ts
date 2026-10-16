import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { UIMessageChunk } from 'ai'
import type { SpiffyBridge, StreamHandlers } from '@shared/ipc'
import type { RerunEvent } from '@shared/rerun'
import type { TermEvent } from '@shared/terms'
import type { SummaryProgress } from '@shared/progress'

let nextId = 0
const newId = (): string => `${Date.now()}-${nextId++}`

function listen<A extends unknown[]>(
  channel: string,
  reqId: string,
  fn: (...args: A) => void,
): () => void {
  const handler = (_e: IpcRendererEvent, id: string, ...args: A): void => {
    if (id === reqId) fn(...args)
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

function stream<T>(name: string, req: unknown, handlers: StreamHandlers<T>): () => void {
  const reqId = newId()
  const stops = [
    listen(`${name}:chunk`, reqId, (chunk: T) => handlers.onChunk(chunk)),
    listen(`${name}:end`, reqId, () => {
      stopAll()
      handlers.onEnd()
    }),
    listen(`${name}:error`, reqId, (message: string) => {
      stopAll()
      handlers.onError(message)
    }),
  ]
  const stopAll = (): void => stops.forEach((s) => s())
  ipcRenderer.send(`${name}:start`, reqId, req)
  return () => {
    stopAll()
    ipcRenderer.send(`${name}:cancel`, reqId)
  }
}

const api: SpiffyBridge = {
  loadSource: (req) => ipcRenderer.invoke('source:load', req),

  async summarize(sessionId, backend, onPartial, onProgress) {
    const reqId = newId()
    const stops = [
      listen('summary:partial', reqId, onPartial),
      listen('summary:progress', reqId, (progress: SummaryProgress) => onProgress?.(progress)),
    ]
    try {
      return await ipcRenderer.invoke('summary:run', reqId, sessionId, backend)
    } finally {
      stops.forEach((s) => s())
    }
  },

  chat: (req, handlers) => stream<UIMessageChunk>('chat', req, handlers),
  simplify: (req, handlers) => stream<string>('simplify', req, handlers),
  explainTerm: (req, handlers) => stream<TermEvent>('term', req, handlers),
  explanations: (sessionId) => ipcRenderer.invoke('explanations', sessionId),
  checkSource: (sessionId) => ipcRenderer.invoke('source:check', sessionId),
  rerunChange: (req, handlers) => stream<RerunEvent>('rerun', req, handlers),

  pickRepoFolder: () => ipcRenderer.invoke('repo:pick'),
  listBranches: (repoPath) => ipcRenderer.invoke('repo:branches', repoPath),
  linkRepo: (sessionId, repoPath) => ipcRenderer.invoke('repo:link', sessionId, repoPath),
}

contextBridge.exposeInMainWorld('spiffy', api)
