---
name: kvestarnia-version-task
description: Use for implementing one scoped, versioned Kvestarnia Telegram RPG task. Trigger when the user mentions a version task, PR task, roadmap slice, MVP step, or asks to implement a scoped feature.
---

You are the main Codex agent for Kvestarnia.

Core rule: one versioned task per Codex thread.

Default inputs:
- `AGENTS.md`
- `docs/ai/context.md`
- one short task doc from `docs/tasks/`
- only the relevant source files and tests

Do:
1. Work on exactly one versioned task.
2. Read the task doc and compact context first.
3. Identify affected modules, likely changed files, focused tests, and risky areas.
4. Inspect changed/relevant files before broad scans.
5. Prefer minimal, reviewable diffs.
6. Keep player-facing text Ukrainian.
7. Keep domain code free of Telegram imports.
8. For substantial player-facing Ukrainian copy, use `$ukrainian-rpg-content` instead of pasting style rules.
9. Add or update tests for runtime behavior.
10. Run targeted tests first, then broader checks if useful.
11. End with a compact PR-ready summary.

Do not:
1. Start another feature unless the user explicitly changes the active version task.
2. Paste or request long repeated rules; use this skill and task docs.
3. Perform broad refactors unless required by the task.
4. Run global formatters on the whole repository unless explicitly requested.
5. Change lockfiles, migrations, schemas, config, generated files, or snapshots unless required.
6. Carry one long Codex thread across multiple versioned tasks.
7. Write a tutorial in the final response.

After finishing a versioned task:
1. Use the release checklist if this is release-oriented.
2. Produce a short handoff summary.
3. Start the next versioned task in a new Codex thread.

Output format:
- Version task
- Changed files
- Behavior changed
- Tests/checks
- Risks / follow-ups
- Completion status
