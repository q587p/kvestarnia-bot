# Codex prompt — release closeout

Close out the approved release without adding behavior. Read `AGENTS.md`, canonical release workflow, relevant project skills, the release task, final diff, CHANGELOG/news/version rules, and current QA evidence.

Verify scope truthfulness, version lockstep, migration/deploy safety, rollback notes, automated checks, manual Telegram evidence, feature-flag maturity, and unresolved risks. Update only release-owned documentation and archive/supersede the completed task/prompt according to repository conventions. Never fabricate manual QA or production verification.

Run `npm run check` and documentation consistency checks. Return a concise ready/not-ready decision with blockers and exact evidence. Do not commit, push, merge, tag, or deploy unless explicitly asked.
