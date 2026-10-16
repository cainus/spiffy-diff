import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { UIMessageChunk } from 'ai'
import type { SpiffyBridge } from '@shared/ipc'

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

const api: SpiffyBridge = {
  loadSource: (req) => ipcRenderer.invoke('source:load', req),

  async summarize(sessionId, backend, onPartial) {
    const reqId = newId()
    const stop = listen('summary:partial', reqId, onPartial)
    try {
      return await ipcRenderer.invoke('summary:run', reqId, sessionId, backend)
    } finally {
      stop()
    }
  },

  chat(req, handlers) {
    const reqId = newId()
    const stops = [
      listen('chat:chunk', reqId, (chunk: UIMessageChunk) => handlers.onChunk(chunk)),
      listen('chat:end', reqId, () => {
        stopAll()
        handlers.onEnd()
      }),
      listen('chat:error', reqId, (message: string) => {
        stopAll()
        handlers.onError(message)
      }),
    ]
    const stopAll = (): void => stops.forEach((s) => s())
    ipcRenderer.send('chat:start', reqId, req)
    return () => {
      stopAll()
      ipcRenderer.send('chat:cancel', reqId)
    }
  },

  pickRepoFolder: () => ipcRenderer.invoke('repo:pick'),
  listBranches: (repoPath) => ipcRenderer.invoke('repo:branches', repoPath),
  linkRepo: (sessionId, repoPath) => ipcRenderer.invoke('repo:link', sessionId, repoPath),
}

contextBridge.exposeInMainWorld('spiffy', api)
