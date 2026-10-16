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
| 10  | Summary generation  | Adaptive. Remove noise first. If the hunks fit in about 100k tokens: one pass with `streamText` with `Output.object`, and goal cards appear while they stream. If not: one summary per file, then one grouping pass.                                    |
| 11  | Branch source       | You select a repo folder and a branch. If the branch has an open PR, spiffy uses the PR base and the PR metadata. If not, the base is merge-base with `origin/<default branch>`. A toggle adds uncommitted changes as one virtual commit.               |
| 12  | Animations          | Motion (`motion/react`): shared-layout transitions, staggered card entry, direction-aware slides for drill in and drill out.                                                                                                                            |
| 13  | Language            | All technical text that spiffy shows (summaries, goal and change text, agent answers, UI text) is in ASD-STE100 Simplified Technical English. The summary prompt and the agent prompt share one rule set.                                               |

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

All phases are done:

1. Skeleton, tooling, quality gates.
2. Diff core: hunks, hunk IDs, noise, coverage, cache keys.
3. Sources: PR URLs, `gh`, branch base, workspaces, local copies.
4. Summary generation: prompt, schema, single pass, map-reduce, cache, recovery from broken provider JSON.
5. Summary UI: zoom stack, breadcrumb, animations.
6. Files view: file list, diffs, hunk badges.
7. Agent: IPC chat transport, focus chip, read-only tools, Claude / Codex.
8. Packaging (`npm run dist`, unsigned).

## Open items

- Codex does not stream partial objects. Goal cards appear all at once for Codex.
- Claude can stream broken JSON for structured output. Spiffy recovers the last valid object. The summary pass has no tools for this reason, so it does not read files.
- Tune the 100k-token limit for map-reduce with real PRs. A forced map-reduce run on sindresorhus/is#215 (27 hunks, Codex) gave 3 goals and covered every hunk.
- `~/.spiffy/worktrees` and `~/.spiffy/repos` grow. They need an expiry rule.
- The packaged app includes the bundled Claude Code binary (about 220 MB) as a fallback. Spiffy uses the `claude` program on the PATH first.
- The app has no icon and no code signature.
