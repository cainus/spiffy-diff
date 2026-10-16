import { homedir } from 'node:os'
import { join } from 'node:path'
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import type { UIMessageChunk } from 'ai'
import type { ChatTurnRequest, LoadRequest, SimplifyRequest, TermRequest } from '@shared/ipc'
import type { TermEvent } from '@shared/terms'
import type { Backend } from '@shared/source'
import { createModel } from './core/backends'
import { chatStream } from './core/chat'
import { listBranches, loadBranchSource, repoName } from './core/git'
import { findOpenPr, loadPrSource, runGh } from './core/github'
import { Sessions } from './core/session'
import { explainTerm } from './core/explain-term'
import { simplify } from './core/simplify'
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
    repoName,
    summarize: async (source, cwd, backend, onPartial, onProgress) =>
      summarize(source, {
        model: await createModel(backend, cwd),
        onPartial,
        onProgress,
        investigate: true,
      }),
  })

  ipcMain.handle('source:load', (_e, req: LoadRequest) => sessions.load(req))

  ipcMain.handle('summary:run', (e, reqId: string, sessionId: string, backend: Backend) =>
    sessions.summarize(
      sessionId,
      backend,
      (partial) => e.sender.send('summary:partial', reqId, partial),
      (progress) => e.sender.send('summary:progress', reqId, progress),
    ),
  )

  /** One IPC stream: `<name>:start` runs `produce`, and each value goes to `<name>:chunk`. */
  const streams = new Map<string, AbortController>()
  function serveStream<Req, Chunk>(
    name: string,
    produce: (req: Req, signal: AbortSignal) => Promise<AsyncIterable<Chunk>>,
  ): void {
    ipcMain.on(`${name}:start`, async (e, reqId: string, req: Req) => {
      const abort = new AbortController()
      streams.set(reqId, abort)
      try {
        for await (const chunk of await produce(req, abort.signal)) {
          if (abort.signal.aborted) break
          e.sender.send(`${name}:chunk`, reqId, chunk)
        }
        e.sender.send(`${name}:end`, reqId)
      } catch (err) {
        if (!abort.signal.aborted) e.sender.send(`${name}:error`, reqId, errorMessage(err))
      } finally {
        streams.delete(reqId)
      }
    })
    ipcMain.on(`${name}:cancel`, (_e, reqId: string) => streams.get(reqId)?.abort())
  }

  serveStream<ChatTurnRequest, UIMessageChunk>('chat', async (req, signal) => {
    const session = sessions.get(req.sessionId)
    const cwd = await sessions.workspace(req.sessionId)
    return chatStream({
      model: await createModel(req.backend, cwd),
      source: session.source,
      summary: session.summary ?? null,
      messages: req.messages,
      focus: req.focus,
      abortSignal: signal,
    })
  })

  serveStream<SimplifyRequest, string>('simplify', async (req, signal) => {
    const cwd = await sessions.workspace(req.sessionId)
    return simplify({
      model: await createModel(req.backend, cwd),
      title: req.title,
      text: req.text,
      abortSignal: signal,
    })
  })

  serveStream<TermRequest, TermEvent>('term', async (req, signal) => {
    const session = sessions.get(req.sessionId)
    const cwd = await sessions.workspace(req.sessionId)
    return explainTerm({
      model: await createModel(req.backend, cwd),
      cwd,
      title: session.source.title,
      term: req.term,
      context: req.context,
      abortSignal: signal,
    })
  })

  ipcMain.handle('repo:pick', async () => {
    const win = getWindow()
    const options = { properties: ['openDirectory' as const], title: 'Select a git repository' }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('repo:link', (_e, sessionId: string, path: string) =>
    sessions.linkRepo(sessionId, path),
  )
  ipcMain.handle('repo:branches', (_e, repoPath: string) => listBranches(repoPath))
}
