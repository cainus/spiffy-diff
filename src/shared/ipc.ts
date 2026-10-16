import type { UIMessage, UIMessageChunk } from 'ai'
import type { Focus } from './focus'
import type { SummaryProgress } from './progress'
import type { Explanation, TermEvent } from './terms'
import type { Backend, LoadedSource } from './source'
import type { ModelSummary, Summary } from './summary'
import type { DeepPartial } from 'ai'

export type LoadRequest =
  | { kind: 'pr'; url: string }
  | { kind: 'branch'; repoPath: string; branch: string; includeUncommitted: boolean }

export interface LoadResult {
  sessionId: string
  source: LoadedSource
}

export interface ChatTurnRequest {
  sessionId: string
  backend: Backend
  messages: UIMessage[]
  focus: Focus
}

export interface SimplifyRequest {
  sessionId: string
  backend: Backend
  title: string
  text: string
}

export interface TermRequest {
  sessionId: string
  backend: Backend
  /** The text that the user selected. */
  phrase: string
  /** The text where the user found the phrase. */
  context: string
}

export interface StreamHandlers<T> {
  onChunk: (chunk: T) => void
  onEnd: () => void
  onError: (message: string) => void
}

export interface BranchList {
  current: string
  branches: string[]
}

/** The API that the preload script gives to the renderer as `window.spiffy`. */
export interface SpiffyBridge {
  loadSource(req: LoadRequest): Promise<LoadResult>
  summarize(
    sessionId: string,
    backend: Backend,
    onPartial: (partial: DeepPartial<ModelSummary>) => void,
    onProgress?: (progress: SummaryProgress) => void,
  ): Promise<Summary>
  chat(req: ChatTurnRequest, handlers: StreamHandlers<UIMessageChunk>): () => void
  pickRepoFolder(): Promise<string | null>
  listBranches(repoPath: string): Promise<BranchList>
  /** Explain a text again as for a child (ELI5). The chunks are text. */
  simplify(req: SimplifyRequest, handlers: StreamHandlers<string>): () => void
  /** True when the open source has new commits or new uncommitted changes since it loaded. */
  checkSource(sessionId: string): Promise<boolean>
  /** Explain a selected phrase. The agent reads the code first. Main saves the answer for the source. */
  explainTerm(req: TermRequest, handlers: StreamHandlers<TermEvent>): () => void
  /** The saved explanations of the source. The key is `phraseKey(phrase)`. */
  explanations(sessionId: string): Promise<Record<string, Explanation>>
  /** Use a local copy of the repository as the agent's workspace. */
  linkRepo(sessionId: string, repoPath: string): Promise<void>
}
