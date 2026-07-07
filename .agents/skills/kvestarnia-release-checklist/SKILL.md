---
name: kvestarnia-release-checklist
description: Use before finishing, merging, or closing a versioned Kvestarnia task. Trigger when the user asks to finalize, prepare release notes, check readiness, close a version task, or prepare handoff to a new Codex thread.
---

Use this skill at the end of a versioned task.

Checklist:
1. Confirm the requested behavior is implemented.
2. Confirm the diff is scoped to the version task.
3. Confirm no unrelated files were changed.
4. Confirm migrations, schemas, config, generated files, snapshots, and lockfiles changed only when required.
5. Confirm relevant tests/checks were run, or blockers are named.
6. Confirm player-facing text is Ukrainian and Telegram-friendly.
7. If substantial player-facing copy changed, confirm it follows `$ukrainian-rpg-content` / `docs/design/content-style-guide.md`.
8. Confirm changelog/news/package version surfaces are updated only when the task is release-oriented.
9. Confirm manual Telegram QA is listed for behavior changes.
10. Confirm risks and follow-ups are documented.
11. Prepare a compact handoff for the next fresh Codex thread.

Handoff format for the next thread:
- Version completed:
- Behavior changed:
- Changed files:
- Tests run:
- Important decisions:
- Known risks:
- Suggested next task doc:

Output format:
- Release readiness
- Tests/checks run
- Manual QA
- Changelog/news status
- Remaining risks
- Handoff summary
- Recommended PR title
