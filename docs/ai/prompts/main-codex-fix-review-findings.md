# Main Codex — Fix Review Findings Prompt

Use this prompt after a second-Codex review finds blockers, important issues, edge cases, or missing tests.

```text
Use $kvestarnia-version-task.

Task:
Fix second-Codex review findings for PR #<number>.

Branch:
<branch-name>

Version task:
docs/tasks/<version>-<short-slug>.md

Review payload:
<paste only blockers, important issues, missing tests, and key edge cases>

Context:
docs/ai/context.md

Follow AGENTS.md.

Focus:
- blockers first
- correctness regressions
- Telegram callbacks / duplicate clicks / stale callbacks
- player/session/state consistency
- idempotency of rewards, progress, inventory, fights, sessions, and resets
- race conditions / concurrent players
- DB transaction and replay-safety risks
- missing automated tests
- compact manual Telegram QA notes if behavior changed

Constraints:
- stay within the current version task
- minimal diff
- no unrelated refactor
- no global formatter
- no lockfile, schema, migration, config, generated-file, or snapshot changes unless required by the review finding
- do not broaden the PR beyond the reviewed scope

Run focused tests first.

Final output:
- findings addressed
- changed files
- tests run
- risks / follow-ups
- completion status

No tutorial.
```
