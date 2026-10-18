# spiffy-diff

![spiffy-diff explains a pull request from the top down](docs/brag.gif)

spiffy-diff is a desktop app. It explains a GitHub pull request or a local branch from the top down:

1. **Goals**: the main purposes of the changes.
2. **Changes**: the related sets of code edits for each goal.
3. **Code**: the diff hunks of each change, with a short STE note beside each hunk.

An agent panel is available at each level. You can ask questions about the part that you look at.
The **Files** view shows all changed files, one diff at a time. Each hunk links to its change.

All technical text in the app is in ASD-STE100 Simplified Technical English.

Words in this project have the meanings in [CONTEXT.md](CONTEXT.md). Decisions are in [PLAN.md](PLAN.md) and [docs/adr](docs/adr).

## Requirements

- macOS, Node.js 22 or later, git.
- The `gh` CLI, logged in (`gh auth login`). spiffy-diff reads pull requests with it.
- One or both agent programs, logged in:
  - Claude Code: `claude` (run `claude` one time to log in). spiffy-diff requires it. It does not include its own copy.
  - Codex: `codex` (run `codex login`).

spiffy-diff uses the programs in your login shell PATH. It does not ask for API keys.

## Start

```sh
npm install
npm run dev
```

npm 11 runs install scripts only for approved packages. `package.json` approves `electron` in `allowScripts`.

## Build the app

```sh
npm run dist
open release/mac-arm64/spiffy-diff.app
```

The app is not signed.

## Use

- Paste a pull request URL and click **Explain**. Or select a repository folder and a branch.
  - For a branch with an open pull request, spiffy uses the base and the text of that pull request.
  - "Include uncommitted changes" adds your working tree to the current branch.
- Click a goal to drill in. Click a change to see its code.
- **ELI5** beside an explanation asks the agent to explain it again as for a child. Click it again to hide it.
- Select any text in an explanation, a hunk note, or a popup, then press Explain. A popup shows the answer and what the agent reads while it works. Select text in a popup (or click an underlined phrase in it) to open another popup on top, to any depth. Escape closes the top popup; a click in a lower popup closes the popups above it. ↻ explains again.
- Explained phrases are saved per repository in `~/.spiffy/explanations/` (the data folder keeps its old name, because git worktrees in it use absolute paths). They are underlined wherever they appear, in this PR and in later PRs of the same repository. A click shows the saved answer.
- Diffs show Unified or Split (side by side). The choice is on each change page and in the Files view, and it is remembered.
- Rerun on a change page makes the agent read the code again and write that change and its hunk notes again. The hunks stay in the same change. The new text is saved in the summary cache.
- Each change has a type: New functionality, Internal change (performance, logging, metrics, dependencies), or Refactor (no behavior change).
- The first time a change page opens, the agent reads the code and writes the margin notes (what each hunk changes and why) and a note for each block of red or green lines. Point at a red line for "BEFORE: what the old code did", or at a green line for "NOW: what the new code does". Everything is saved in the summary cache.
- The agent panel starts closed. The Agent button in the top bar opens it; spiffy-diff remembers the choice.
- Keys: ↑/↓ move the highlight (or go to the last/next change or file), → or Enter drills in, ← or Escape drills out.
- spiffy-diff checks for new commits (or new uncommitted changes on a branch) every minute while the window has the focus, and when you come back to the window. A banner offers Reload, which keeps your place.
- At start, spiffy-diff opens the last source at the place where you left it. Press Change PR in the top bar to open a different PR or branch.
  - dotted blue: technical jargon
  - green, monospace: internal code concepts
  - wavy amber: internal business concepts
- Press **Esc** or **Backspace** to drill out. Click a breadcrumb to jump to a level.
- **Summary / Files** switches the view.
- **Claude / Codex** selects the agent. A change makes the summary again.
- The folder button uses a local copy of the repository for a pull request. If you do not select one, spiffy makes a clone in `~/.spiffy/repos`.

## Data

spiffy-diff keeps its data in `~/.spiffy`:

| Path         | Content                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| `summaries/` | Summaries. The key is (repo, base, head, uncommitted-changes hash, agent). |
| `worktrees/` | Read-only checkouts of the head commit for the agent.                      |
| `repos/`     | Clones of repositories that have no local copy.                            |
| `repos.json` | The local copy of each repository.                                         |

## Development

```sh
npm run check   # lint, format, typecheck, tests, knip
```

The pre-push hook runs `npm run check`.

- Write a failing test before production code.
- Pure logic is in `src/shared` and `src/main/core`. These tests do not need Electron.
- View tests are in `src/renderer/src/**/*.test.tsx`. They run in jsdom with a fake `window.spiffy`.
