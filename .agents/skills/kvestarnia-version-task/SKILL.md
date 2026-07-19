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
10. Run targeted tests while editing, then wait until relevant source, tests, schema, config, package and lockfile bytes are stable before the final broad gate.
11. Give named final phases at least a 600-second command budget, or run them in one yielded session and poll that same session until its real exit code is known. Never start a duplicate full gate because output was compacted while the original process is still alive.
12. Treat a confirmed exit code `0` as valid until a relevant source, test, schema, config, package or lockfile changes. An output-channel `EPIPE`, killed process, timeout, missing final status or malformed result is unproven, never a pass; do not globally raise test-level timeouts to work around command transport.
13. Before final handoff, re-check the current Kyiv day against the latest release/news/changelog Holocene headings; same-PR follow-ups and review fixes must refresh those headings if the branch now has a newer Kyiv-day commit.
14. End with a compact PR-ready summary.

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
