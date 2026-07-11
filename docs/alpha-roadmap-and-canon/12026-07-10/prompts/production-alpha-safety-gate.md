# Codex prompt — production alpha safety gate

Implement the approved production-safety task in small, reversible slices. First read `AGENTS.md`, canonical operations/security docs, relevant project skills, runtime startup, health server, Prisma configuration, and deploy docs.

Create truthful liveness/readiness semantics, production fail-fast behavior for missing required config, tests, a sanitized deploy snapshot template, feature-flag inventory template, and backup/restore runbook. Never print or commit secrets, env values, database contents, Telegram IDs, or private operator data. Do not change the deployed health target until the new readiness route is verified.

Treat SQLite as the current database. Do not migrate to PostgreSQL. Distinguish code-complete from an actually executed backup/restore drill; leave explicit evidence placeholders for operator-only steps. Run focused tests and `npm run check`, then report what is automated, what still requires an operator, rollback steps, and residual risk. Do not deploy unless explicitly asked.
