---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up. Use when the next step runs in another session, directory, harness or agent (a prototype detour, a side task forked mid-phase), or the user asks for a handoff.
argument-hint: "What will the next session be used for?"
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to `.scratch/handoffs/<YYYY-MM-DD>-<slug>.md` in the working directory and cite it by that relative path, one per line, in code (the user's terminal opens relative paths only, and `/tmp` disappears). If `git check-ignore .scratch` finds it unignored, append `/.scratch/` to `.git/info/exclude` (never the versioned `.gitignore`).

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
