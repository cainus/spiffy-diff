import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DeepPartial } from 'ai'
import type { LoadRequest, LoadResult } from '@shared/ipc'
import type { SummaryProgress } from '@shared/progress'
import {
  parsePrUrl,
  summaryCacheKey,
  type Backend,
  type LoadedSource,
  type SourceHead,
} from '@shared/source'
import type { ModelSummary, Summary } from '@shared/summary'
import { phraseKey, type Explanation } from '@shared/terms'
import { readCachedSummary, writeCachedSummary } from './cache'
import type { WorkspaceRequest } from './workspace'

export interface SessionDeps {
  /** The spiffy data folder, for example `~/.spiffy`. */
  home: string
  loadPr: (url: string) => Promise<LoadedSource>
  loadBranch: (
    repoPath: string,
    branch: string,
    includeUncommitted: boolean,
  ) => Promise<LoadedSource>
  ensureWorkspace: (req: WorkspaceRequest) => Promise<string>
  /** The head of a source, without its diff. */
  headOf: (request: LoadRequest) => Promise<SourceHead>
  /** The GitHub `owner/name` of a local folder. */
  repoName: (path: string) => Promise<string>
  summarize: (
    source: LoadedSource,
    cwd: string,
    backend: Backend,
    onPartial: (p: DeepPartial<ModelSummary>) => void,
    onProgress?: (progress: SummaryProgress) => void,
  ) => Promise<Summary>
}

interface Session {
  request: LoadRequest
  source: LoadedSource
  workspace?: Promise<string>
  summary?: Summary
}

/** The sources that are open in the app, and their workspaces and summaries. */
export class Sessions {
  private readonly sessions = new Map<string, Session>()

  constructor(private readonly deps: SessionDeps) {}

  async load(request: LoadRequest): Promise<LoadResult> {
    const source =
      request.kind === 'pr'
        ? await this.deps.loadPr(request.url)
        : await this.deps.loadBranch(request.repoPath, request.branch, request.includeUncommitted)
    if (request.kind === 'branch') await this.rememberRepo(source.repo, request.repoPath)
    const sessionId = randomUUID()
    this.sessions.set(sessionId, { request, source })
    return { sessionId, source }
  }

  /** True when the source has a new head commit or new uncommitted changes since it loaded. */
  async hasNewVersion(sessionId: string): Promise<boolean> {
    const { request, source } = this.get(sessionId)
    try {
      const head = await this.deps.headOf(request)
      return head.headSha !== source.headSha || head.dirtyHash !== source.dirtyHash
    } catch {
      // A failed check (offline, gh logged out) must not show a false banner.
      return false
    }
  }

  get(sessionId: string): Session {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Unknown session ${sessionId}.`)
    return session
  }

  async workspace(sessionId: string): Promise<string> {
    const session = this.get(sessionId)
    session.workspace ??= this.makeWorkspace(session)
    return session.workspace
  }

  /** Use a local copy of the repository for this source and for later sources of the same repository. */
  async linkRepo(sessionId: string, path: string): Promise<void> {
    const session = this.get(sessionId)
    const name = await this.deps.repoName(path)
    if (name !== session.source.repo) {
      throw new Error(`The folder ${path} is a copy of ${name}, not ${session.source.repo}.`)
    }
    await this.rememberRepo(name, path)
    session.workspace = undefined
  }

  /** The phrases that the user had explained in this repository. The key is `phraseKey(phrase)`. */
  async explanations(sessionId: string): Promise<Record<string, Explanation>> {
    try {
      return JSON.parse(await readFile(this.explanationsFile(sessionId), 'utf8')) as Record<
        string,
        Explanation
      >
    } catch {
      return {}
    }
  }

  async rememberExplanation(sessionId: string, phrase: string, text: string): Promise<void> {
    const all = await this.explanations(sessionId)
    await mkdir(join(this.deps.home, 'explanations'), { recursive: true })
    await writeFile(
      this.explanationsFile(sessionId),
      JSON.stringify({ ...all, [phraseKey(phrase)]: { phrase, text } }),
    )
  }

  private explanationsFile(sessionId: string): string {
    const { source } = this.get(sessionId)
    // Explanations describe the repository, so later PRs and branches of the same repository reuse them.
    return join(this.deps.home, 'explanations', `${source.repo.replace(/[^\w.-]/g, '_')}.json`)
  }

  async summarize(
    sessionId: string,
    backend: Backend,
    onPartial: (p: DeepPartial<ModelSummary>) => void,
    onProgress?: (progress: SummaryProgress) => void,
  ): Promise<Summary> {
    const session = this.get(sessionId)
    const { source } = session
    const key = summaryCacheKey({ ...source, backend })
    const cached = await readCachedSummary(this.deps.home, key)
    if (cached) {
      session.summary = cached
      return cached
    }
    const cwd = await this.workspace(sessionId)
    const summary = await this.deps.summarize(source, cwd, backend, onPartial, onProgress)
    await writeCachedSummary(this.deps.home, key, summary)
    session.summary = summary
    return summary
  }

  private async makeWorkspace(session: Session): Promise<string> {
    const { request, source } = session
    if (request.kind === 'branch' && source.dirtyHash) return request.repoPath
    const localRepo =
      request.kind === 'branch' ? request.repoPath : await this.knownRepo(source.repo)
    const pr = source.prUrl ? parsePrUrl(source.prUrl) : null
    return this.deps.ensureWorkspace({
      repo: source.repo,
      headSha: source.headSha,
      cloneUrl: `https://github.com/${source.repo}.git`,
      localRepo,
      home: this.deps.home,
      fetchRefs: pr ? [`pull/${pr.number}/head`] : [],
    })
  }

  private reposFile(): string {
    return join(this.deps.home, 'repos.json')
  }

  private async repos(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.reposFile(), 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private async knownRepo(repo: string): Promise<string | null> {
    return (await this.repos())[repo] ?? null
  }

  private async rememberRepo(repo: string, path: string): Promise<void> {
    const repos = await this.repos()
    if (repos[repo] === path) return
    await mkdir(this.deps.home, { recursive: true })
    await writeFile(this.reposFile(), JSON.stringify({ ...repos, [repo]: path }, null, 2))
  }
}
