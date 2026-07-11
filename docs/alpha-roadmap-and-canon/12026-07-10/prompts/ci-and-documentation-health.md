# Codex Prompt — CI and Documentation Health

```text
Start from current origin/main after the docs reconciliation. Verify the current documentation layout before adding checks.

First inspect AGENTS.md and relevant project skills under .agents/skills/. If no project skill materially applies to this tooling-only task, continue without forcing one.

Task:
Add a dependency-free documentation health check and wire it into the repository's normal CI workflow.

Reference:
- docs/source-of-truth-matrix.md
- docs/repo-change-plan.md
- analysis/03-docs-and-public-site-audit.md

Implement a small Node script and npm command that check:
- relative Markdown link targets
- raw repository paths in README.md, AGENTS.md, .agents/skills, active docs/ai/prompts, docs indexes and current task docs
- package.json/package-lock/latest CHANGELOG/latest news/current-state version parity
- the agreed docs/ai/context.md byte or word budget
- active prompts do not target shipped, superseded or missing tasks
- at most one task is marked active

Rules:
- no network calls in CI
- no new dependency unless the existing toolchain makes a zero-dependency implementation unreasonable
- archives/history may contain old factual text, but broken paths and links should still be reported according to an explicit allowlist policy
- diagnostics must print file, line and failing target/rule
- keep the script deterministic on Windows and Linux
- do not modify runtime, Prisma, migrations, release metadata or player-facing copy
- no version bump

Add focused tests or self-test fixtures for valid links, missing links, raw paths, archives, version drift and context-size failure. Wire the command into GitHub Actions and the local check flow only after confirming it is fast and stable.

Run:
- the new documentation check
- its focused tests
- git diff --check
- the smallest relevant existing CI/check command

Final output:
- changed files
- rules enforced
- allowlist/exclusion policy
- checks run
- risks / follow-ups
- completion status

No tutorial.
```
