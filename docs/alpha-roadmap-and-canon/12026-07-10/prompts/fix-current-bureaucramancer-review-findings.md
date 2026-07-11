# Codex prompt — fix approved Bureaucramancer review findings

Implement only the approved findings from the latest deep review. Read `AGENTS.md`, canonical AI context/workflow, relevant project skills, the current release task, and the exact affected code before editing.

Preserve the release contract and freeze scope. Use server-owned state, CAS/idempotency, safe callback answers, explicit snapshot compatibility, and deterministic raid interaction rules. Add focused regression tests for each fix; do not refactor unrelated code or rebalance unrelated systems.

Run focused tests, then `npm run check`. Re-review the final diff for unintended files, migration safety, release truthfulness, and secrets. Return a concise change/evidence/residual-risk report. Do not commit, push, merge, or deploy unless explicitly asked.
