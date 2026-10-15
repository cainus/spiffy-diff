# Spiffy — Glossary

This file is a glossary. It defines the words that spiffy uses. It does not
describe how spiffy works.

## Inputs

**Source**
The thing that you ask spiffy to summarize. A source is a PR source or a
branch source.

**PR source**
A GitHub pull request URL.

**Branch source**
A local repository folder and a branch name. If the branch has an open pull
request, the branch source uses the base and the metadata of that pull request.

**Base**
The commit that the changes start from. For a PR source, the base is the PR
base commit. For a branch source without a PR, the base is the merge-base of
the branch and the default branch of `origin`.

**Head**
The last commit of the changes. When "include uncommitted changes" is on, the
head includes the working tree as one virtual commit.

**Workspace**
The read-only checkout of the head that the agent can read. A workspace is a
git worktree.

## The summary

**Summary**
The top-down explanation of a source. A summary contains goals.

**Goal**
One main purpose of the source. A goal contains changes. Example: "Add retry
to the payment client."

**Change**
One related set of code edits that serves a goal. A change refers to hunks.
Example: "Wrap the HTTP call in a retry loop with backoff."

**Hunk**
One contiguous block of added and removed lines in one file, as `git diff`
shows it.

**Hunk ID**
The stable name of a hunk inside one summary. The model uses hunk IDs to
attach hunks to changes.

**Coverage**
The rule that each hunk belongs to one or more changes. Spiffy checks
coverage after the model answers.

**Other changes**
The goal that holds the hunks the model did not attach to a change.

**Noise**
Hunks in files that a person does not review: lockfiles, generated files,
snapshots, and vendored code. Spiffy puts noise in the
"Generated & lockfiles" goal without the model.

## Navigation

**Level**
One step in the summary tree: the source level, the goal level, or the change
level.

**Drill in**
Go from one level to the next deeper level.

**Drill out**
Go from one level to the next higher level.

**Files view**
The view that lists all changed files and shows the diff of one file.

## The agent

**Agent**
The general-purpose assistant that answers questions about the source.

**Backend**
The local program that runs the agent: Claude (Claude Code) or Codex.

**Conversation**
The one chat history for one source.

**Focus**
The level, goal, change, or file that you look at now. Spiffy sends the focus
with each message to the agent.
