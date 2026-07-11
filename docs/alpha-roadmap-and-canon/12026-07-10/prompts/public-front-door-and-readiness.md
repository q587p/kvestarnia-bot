# Codex Prompt — Public Front Door and Readiness

```text
Start from current origin/main after the docs current-state reconciliation is present. Verify the base, package version and task registry before editing; do not stack on an unmerged feature branch.

First inspect AGENTS.md and relevant project skills under .agents/skills/. Use $kvestarnia-version-task only if this work has been activated as a numbered runtime task. Use $ukrainian-rpg-content for substantial public Ukrainian copy. Do not activate unrelated skills.

Implement:
tasks/public-front-door-and-readiness.md

Read only the relevant package references first:
- analysis/03-docs-and-public-site-audit.md
- docs/source-of-truth-matrix.md
- docs/repo-change-plan.md

Priorities:
1. Honest /health liveness versus /ready readiness.
2. Production must not report ready without required bot config, DB readiness and runtime ready state.
3. Homepage must degrade safely when presence is unavailable.
4. Public copy must distinguish shipped, feature-flagged and production-confirmed state.
5. Bound or paginate the news archive and avoid unnecessary synchronous reparsing.
6. Version Render build/start/disk/health shape without committing secrets.

Hard boundaries:
- no gameplay, reward, balance, callback, economy or schema changes
- no public player names or exact timestamps
- no Redis, webhook migration, custom domain, analytics or payment integration
- do not infer live feature flags from source defaults
- preserve HTML escaping and existing privacy tests
- keep /health cheap; do not turn it into a heavy DB/API endpoint

Run focused health, config, runtime and public-site tests first, then npm run check before release-ready handoff.

After deployment, require explicit verification of /health, /ready, homepage, news, presence and one real Telegram command. Do not call the task complete based only on local tests if the task includes the Render health-route switch.

Final output:
- changed files
- liveness/readiness contract
- public behavior changed
- tests run
- deploy and rollback verification
- unresolved production facts
- risks / follow-ups
- completion status

No tutorial.
```
