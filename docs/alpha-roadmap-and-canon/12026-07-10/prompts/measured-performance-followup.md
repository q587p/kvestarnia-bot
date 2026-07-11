# Codex prompt — measured performance follow-up

Implement the approved slice from tasks/measured-performance-followup.md. First read AGENTS.md, docs/ai/context.md, the 0.3.5 performance task, relevant operations/security docs, current instrumentation, route call sites, repository methods, Prisma schema, and focused tests. Use $kvestarnia-version-task. Use $kvestarnia-telegram-qa only for a truthful operator QA plan or when live access is explicitly available.

Correct telemetry semantics before optimizing: one terminal span for success/failure, complete fight end-to-end timing, truthful service/DB bucket names, typed documented config, and sanitized outcomes. Never log secrets, raw Telegram IDs, player text, callback data, state JSON, database URLs, or SQL parameters.

Use supplied live evidence to rank candidates. Implement only the owner-approved measured hotspot, except that already-proven unbounded attunement or passage behavior may be fixed as an explicit boundedness/correctness slice. Prefer indexed bounded queries, narrow projections, idempotent transitions, and small migrations with rollback/backfill notes. Preserve replay, restart, remort, notification, and production-flag behavior.

Do not add Redis, a queue, an observability vendor, a broad cache, a database migration to PostgreSQL, or a service rewrite. If evidence is missing or no candidate was approved, stop after instrumentation/evidence work and report the decision needed instead of guessing.

Run focused unit/integration tests and npm run check. For schema work, also validate Prisma, migrate a fresh database, and test legacy pending rows. Update the task and operations evidence truthfully; never mark manual Telegram QA or production sampling complete unless it was actually run. Handoff with changed files, before/after evidence, tests, rollback, operator-only steps, and residual risk.
