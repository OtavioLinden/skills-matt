---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

## Steps

1. Read the spec and tickets to understand the task graph.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. The orchestrator creates each worktree itself with `git worktree add -b <ticket-branch> <absolute-path> <integration-branch>` and launches the implementer without `isolation: "worktree"`, since that option can base the worktree on the default branch instead of the integration branch. Each implementer subagent:
   - confirms its worktree is on the integration branch's history before starting; if not, stops and reports;
   - calls the Skill tool with `tdd` to build the ticket;
   - merges the integration branch tip into its own branch before reporting done

   **Implementer brief**, in addition to the context pointers:
   - Model: sonnet. Opus only when the ticket needs design work.
   - Every command uses the literal absolute worktree path. No shell variables for it, no `cd` outside it.
   - Waiting on a test: never `sleep`. Run a `--filter` test in the foreground, or load Monitor with `ToolSearch select:Monitor` first. The full suite belongs to the orchestrator.
   - Report once, when done or blocked. Never send a partial report while waiting on background work.
   - Shared notes are written only by the orchestrator.
   - May disagree with the ticket with a reason; flag its own decisions in the report; report a bug in the plan instead of working around it silently.

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**.

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single **implementer subagent**.

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

9. Clean up all **implementer subagent** worktrees.
