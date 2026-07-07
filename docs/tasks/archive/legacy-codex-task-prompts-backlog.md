# Codex Task Prompts Backlog

This file is no longer the primary place for long copy-paste prompts.

Use instead:

- `docs/tasks/README.md` — task doc convention.
- `docs/tasks/0.1.xx-template.md` — current version task template.
- `docs/ai/prompts/main-new-version-thread.md` — main Codex startup prompt.
- `docs/ai/prompts/second-codex-pr-review.md` — second Codex changed-files review prompt.
- `docs/ai/context.md` — compact project context.

## Active prompt policy

Prompts should be short and skill-based:

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/<version>-<short-slug>.md

Context:
docs/ai/context.md

Follow AGENTS.md.
Final output: changed files, behavior changed, tests run, risks, completion status. No tutorial.
```

Do not paste long repeated rules into prompts. Put durable rules in `AGENTS.md`, `.agents/skills/*`, and the task doc.

## Second Codex review prompt

```text
Use $kvestarnia-second-codex-readonly.

Review PR #<number> against main.
Mode: READ ONLY report only.
Scope: changed files only by default. Inspect direct dependencies only if needed.
Focus: correctness, regressions, Telegram callbacks/messages, player/session/state consistency, idempotency, missing tests.
Output: blockers, important issues, minor issues, missing tests, manual Telegram checks, safe notes. No tutorial.
```

## Historical note

The previous long prompt backlog for draft `0.0.17`-`0.0.19` tasks was preserved here:

- `docs/tasks/archive/legacy-codex-task-prompts-backlog-0.0.17-0.0.19.md`

Do not use that legacy file as active task direction unless a human explicitly reopens one of those ideas. The shipped version history is now tracked as compact task records in `docs/tasks/` and detailed release history remains in `CHANGELOG.md`.
