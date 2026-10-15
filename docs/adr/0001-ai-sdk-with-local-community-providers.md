# 1. Use the AI SDK with community providers for local Claude and Codex

Status: accepted

## Context

Spiffy must use the agent programs that the user already has on the
computer: Claude Code and Codex. The user is already logged in to these
programs. Spiffy must not ask for API keys.

The UI uses the shadcn AI SDK components (AI Elements). These components
expect the Vercel AI SDK (`useChat`, UI message streams).

We had four options:

1. The AI SDK in the Electron main process with the community providers
   `ai-sdk-provider-claude-code` and `ai-sdk-provider-codex-cli`.
2. The official SDKs (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`)
   and two adapters that we write.
3. Start the CLIs as child processes and parse their JSON output.
4. API keys and the normal Anthropic and OpenAI providers.

## Decision

We use option 1. The main process runs `streamText` and `streamObject` with
the community providers. The renderer uses `useChat` with a custom
transport that sends data through Electron IPC.

## Consequences

- One code path serves both backends.
- `streamObject` gives the typed summary (goals, changes, hunk IDs) for both
  backends.
- The community providers can be late when the CLIs change. If a provider
  breaks, the fallback is option 2 for that backend only. The rest of spiffy
  does not change, because all model calls go through one module.
