# Codex Prompt — Docs Current-State Reconciliation

```text
Start from current origin/main. Expected reference snapshot: 0.3.5 at 3c2c5945; verify it and report any meaningful drift before editing.

First inspect AGENTS.md and the relevant project skills under .agents/skills/. Use $ukrainian-rpg-content only for player-facing Ukrainian copy if it materially applies. Do not activate unrelated skills.

Implement the docs-only task from this package:
tasks/docs-current-state-reconciliation.md

Use these package references:
- analysis/03-docs-and-public-site-audit.md
- docs/source-of-truth-matrix.md
- docs/repo-change-plan.md

Hard scope:
- README, product/current-state/roadmap, task registry, AI context/workflow/prompts, docs structure, stale backlog status and skill paths
- no runtime, tests, Prisma, migrations, package metadata or lockfile changes
- no CHANGELOG.md or news.md edits
- no version bump, tag or release
- do not claim a feature flag is enabled in production without checked evidence
- preserve historical audit text as historical; add status banners or archive active copies instead of silently rewriting history

Keep docs/ai/context.md genuinely compact. Target at most 10 KB or 1,500 words unless the repository owner has set a stricter current limit.

Validate:
- git diff --check
- relative Markdown links
- raw repository paths in README, AGENTS.md, .agents/skills, active prompts, indexes and current task docs
- version/current-task wording with rg
- context byte and word count

Final output:
- changed files
- canonical state decisions
- checks run
- unresolved production facts
- risks / follow-ups
- completion status

No tutorial.
```
