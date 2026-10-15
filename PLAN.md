# Spiffy — Plan

Spiffy is an Electron app. It explains a pull request or a local branch from
the top down: goals → changes → code. An agent is available at each level.

Words in this file have the meanings in `CONTEXT.md`.

## Decisions

| #   | Topic               | Decision                                                                                                                                                                                                                                                |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Model access        | AI SDK in the main process. `ai-sdk-provider-claude-code` and `ai-sdk-provider-codex-cli`. The renderer uses `useChat` with an IPC transport. See ADR 0001.                                                                                             |
| 2   | Code under a change | Hunk IDs and a coverage check. See ADR 0002.                                                                                                                                                                                                            |
| 3   | PR input            | The `gh` CLI (`gh pr view`, `gh pr diff`). Spiffy uses the GitHub login of the user.                                                                                                                                                                    |
| 4   | Cache               | Spiffy keeps summaries by (repo, base SHA, head SHA, dirty-tree hash). A new push makes a new summary.                                                                                                                                                  |
| 5   | Agent permissions   | Read-only. The agent does not edit code. The agent does not write to GitHub.                                                                                                                                                                            |
| 6   | Workspace           | If the repo is on the computer (spiffy finds it from the remote URL, or you select it one time), spiffy makes a temporary worktree at the head. If not, spiffy makes a blobless clone in `~/.spiffy/repos` and a worktree from it.                      |
| 7   | Conversation        | One conversation for each source. The agent panel stays at the right. Each message includes the focus. A chip in the composer shows the focus.                                                                                                          |
| 8   | Diff renderer       | `@pierre/diffs` (Shiki). The diff fades in after the card animation ends, because the renderer uses Shadow DOM.                                                                                                                                         |
| 9   | Layout              | Zoom stack. One level at a time. The card that you click grows into the header of the next level (Motion `layoutId`). Esc or Backspace drills out. Breadcrumb at the top. A Summary / Files toggle. Hunk badges in the files view link to their change. |
| 10  | Summary generation  | Adaptive. Remove noise first. If the hunks fit in about 100k tokens: one pass with `streamObject`, and goal cards appear while they stream. If not: one summary per file, then one grouping pass.                                                       |
| 11  | Branch source       | You select a repo folder and a branch. If the branch has an open PR, spiffy uses the PR base and the PR metadata. If not, the base is merge-base with `origin/<default branch>`. A toggle adds uncommitted changes as one virtual commit.               |
| 12  | Animations          | Motion (`motion/react`): shared-layout transitions, staggered card entry, direction-aware slides for drill in and drill out.                                                                                                                            |

## Stack

- Electron + electron-vite
- React 19, TypeScript, Tailwind CSS v4
- shadcn/ui + AI Elements (`@ai-sdk/react`)
- Motion
- `@pierre/diffs`
- zod

## Quality gates

- TDD. Write a failing test before production code.
- Vitest for unit tests. Pure logic lives in `src/shared` and
  `src/main/core`, so tests do not need Electron.
- ESLint (typescript-eslint, react-hooks) and Prettier.
- `tsc --noEmit` for the main, preload, and renderer projects.
- knip finds dead code, unused files, and unused dependencies.
- A Husky pre-push hook runs: lint, typecheck, test, knip.

## Phases

1. Skeleton. Repo, tooling, quality gates, an empty window.
2. Diff core (TDD). Parse a unified diff into files and hunks. Give hunk
   IDs. Find noise. Check coverage. Make cache keys.
3. Source resolution (TDD). Parse PR URLs. Read PR data with `gh`. Find the
   base for a branch source. Make the workspace.
4. Summary generation. Prompt, zod schema, single pass, map-reduce, cache.
5. Summary UI. Zoom stack, breadcrumb, goal cards, change list, hunk view,
   animations.
6. Files view. File tree, `@pierre/diffs` viewer, hunk badges, links into the
   summary.
7. Agent. IPC chat transport, focus chip, read-only tools in the workspace,
   backend picker (Claude / Codex).
8. Polish. Settings, errors, empty states, packaging.

## Open items

- Tune the 100k-token limit with real PRs.
- Clean up worktrees when spiffy starts (from a crash in an earlier run).
