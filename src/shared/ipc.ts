import type { UIMessage, UIMessageChunk } from 'ai'
import type { Focus } from './focus'
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
  ): Promise<Summary>
  chat(req: ChatTurnRequest, handlers: StreamHandlers<UIMessageChunk>): () => void
  pickRepoFolder(): Promise<string | null>
  listBranches(repoPath: string): Promise<BranchList>
  /** Use a local copy of the repository as the agent's workspace. */
  linkRepo(sessionId: string, repoPath: string): Promise<void>
}
