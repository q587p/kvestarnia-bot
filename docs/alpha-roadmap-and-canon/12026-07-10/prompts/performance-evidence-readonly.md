# Codex prompt — performance evidence, read only

Audit current main against tasks/measured-performance-followup.md without editing files. Read AGENTS.md, the 0.3.5 performance task, playtesting and security docs, performanceLogger, relevant route call sites, repositories, Prisma schema/migrations, tests, and CI. Use rg and focused commands; do not perform a broad rewrite review.

Use $kvestarnia-telegram-qa for the live Telegram sampling plan, but never fabricate operator results. If reviewing a named pull request, use $kvestarnia-second-codex-readonly and verify its live base/head first; otherwise keep the same no-edit discipline without assuming PR context.

Report:

- whether spans cover success, failure, and complete end-to-end work;
- sanitized route sample requirements and missing evidence;
- boundedness, predicates, projections, limits, indexes, and growth shape for attunement, passage, achievements, duel/tournament/spar, Mantok cleanup, quest markers, and public HTTP;
- scheduler backlog and shutdown risks;
- exact file:line evidence;
- P0/P1/P2 ranking;
- the smallest safe task slices and measurable acceptance criteria.

Do not expose secrets, Telegram IDs, message text, callback payloads, SQL parameters, database contents, or raw production logs. Do not edit, format, commit, push, deploy, or create a PR. Run only non-mutating checks. End with a short evidence-gap list and state clearly which conclusions are static inferences rather than live measurements.
