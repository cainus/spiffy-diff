import { homedir } from 'node:os'
import { join } from 'node:path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import type { UIMessage } from 'ai'
import type { Focus } from '@shared/focus'
import type { LoadRequest } from '@shared/ipc'
import type { Backend } from '@shared/source'
import { createModel } from './core/backends'
import { chatStream } from './core/chat'
import { listBranches, loadBranchSource } from './core/git'
import { findOpenPr, loadPrSource, runGh } from './core/github'
import { Sessions } from './core/session'
import { summarize } from './core/summarize'
import { ensureWorkspace } from './core/workspace'

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const sessions = new Sessions({
    home: join(homedir(), '.spiffy'),
    loadPr: (url) => loadPrSource(url, runGh),
    loadBranch: (repoPath, branch, includeUncommitted) =>
      loadBranchSource(repoPath, branch, {
        includeUncommitted,
        findPr: (cwd, b) => findOpenPr(cwd, b, runGh),
      }),
    ensureWorkspace,
    summarize: async (source, cwd, backend, onPartial) =>
      summarize(source, { model: await createModel(backend, cwd, 'summary'), onPartial }),
  })

  ipcMain.handle('source:load', (_e, req: LoadRequest) => sessions.load(req))

  ipcMain.handle('summary:run', (e, reqId: string, sessionId: string, backend: Backend) =>
    sessions.summarize(sessionId, backend, (partial) =>
      e.sender.send('summary:partial', reqId, partial),
    ),
  )

  const chats = new Map<string, AbortController>()
  ipcMain.on(
    'chat:start',
    async (
      e,
      reqId: string,
      req: { sessionId: string; backend: Backend; messages: UIMessage[]; focus: Focus },
    ) => {
      const abort = new AbortController()
      chats.set(reqId, abort)
      try {
        const session = sessions.get(req.sessionId)
        const cwd = await sessions.workspace(req.sessionId)
        const stream = await chatStream({
          model: await createModel(req.backend, cwd, 'chat'),
          source: session.source,
          summary: session.summary ?? null,
          messages: req.messages,
          focus: req.focus,
          abortSignal: abort.signal,
        })
        for await (const chunk of stream) {
          if (abort.signal.aborted) break
          e.sender.send('chat:chunk', reqId, chunk)
        }
        e.sender.send('chat:end', reqId)
      } catch (err) {
        if (!abort.signal.aborted) e.sender.send('chat:error', reqId, errorMessage(err))
      } finally {
        chats.delete(reqId)
      }
    },
  )
  ipcMain.on('chat:cancel', (_e, reqId: string) => chats.get(reqId)?.abort())

  ipcMain.handle('repo:pick', async () => {
    const win = getWindow()
    const options = { properties: ['openDirectory' as const], title: 'Select a git repository' }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('repo:branches', (_e, repoPath: string) => listBranches(repoPath))
}
