# Second Codex — PR Review Prompt

Use this for independent read-only review.

```text
Use $kvestarnia-second-codex-readonly.

Review PR #<number> against main.

Mode:
READ ONLY report only.

Scope:
Changed files only by default. Inspect direct dependencies only if needed for correctness.

Focus:
- does the PR match the version task?
- correctness regressions
- Telegram duplicate messages/callbacks
- stale callback behavior
- player/session/state consistency
- presence/routing risks if touched
- idempotency and DB transaction risks
- missing tests
- compact manual Telegram checks

Do not edit files.
Do not run auto-fix/format/codemod.
Do not commit or push.

Output:
- PR summary
- relevant changed files
- findings: blockers / important / minor / looks good
- missing tests
- manual Telegram checks
- questions for main Codex
- safe notes

No tutorial.
```
