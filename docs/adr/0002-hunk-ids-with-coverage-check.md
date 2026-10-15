# 2. Attach code to changes with hunk IDs and a coverage check

Status: accepted

## Context

When you drill in to a change, spiffy must show the exact code of that
change. A model that returns file names and line ranges can return wrong
ranges. Then spiffy shows the wrong code, and the user cannot see the error.

## Decision

- Spiffy parses the diff into hunks before it calls the model.
- Each hunk gets a stable hunk ID (`h1`, `h2`, ...) in diff order.
- The model sees the hunks with their IDs. The model returns
  goals → changes → hunk IDs. It does not return line numbers.
- Spiffy checks the answer:
  - Spiffy removes hunk IDs that do not exist.
  - Spiffy puts each hunk that has no change into the "Other changes" goal.
- Spiffy puts noise hunks (lockfiles, generated files) into the
  "Generated & lockfiles" goal before it calls the model.

## Consequences

- The code under a change is always real code from the diff.
- The UI can show, for each hunk in the files view, the goal and the
  change that own it.
- A model that attaches hunks badly makes a large "Other changes" goal. This
  is visible. It is not a silent failure.
- A change cannot point to part of a hunk. A large hunk that serves two
  changes appears under both changes.
