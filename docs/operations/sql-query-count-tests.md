# SQL Query-Count Tests

## Rule

Performance acceptance must count actual Prisma-emitted SQL statements in an isolated integration database. Mock/service-call counts alone can miss nested Character lookups and Prisma relation expansion.

Reuse the repository pattern already present in `tests/db/prismaHpRecoveryNotificationRepository.integration.test.ts`: construct an isolated `PrismaClient` with query events enabled, attach `$on("query")`, run one operation and count statements by class.

## Safety

- Use a per-test temporary SQLite database.
- Disconnect before cleanup.
- Never point the counter at the local bot or production database.
- Assertions may classify `SELECT` versus write statements, but failure output must not dump SQL parameters or seeded private-like values.
- Reset captured counters immediately before the operation under test so setup/migration statements are excluded.

## Required 0.3.17 matrices

### Friday pending snapshot

Fixtures:

- no character;
- character with zero candidate rows;
- current pending period;
- older pending period;
- cooldown plus completed DailyAction;
- all 24 historical cooldown/completed pairs;
- boundary timestamp and remort/current-life fixtures.

Budgets:

- no character: at most 1 statement;
- every character fixture: at most 3 statements;
- statement count invariant when candidate history grows from 0 to 24;
- no write on read paths.

Also assert repository inputs are deduplicated, `take` is bounded by candidate count and in-memory selection preserves the canonical newest-to-oldest order.

### Quest markers

Fixtures:

- no character;
- new character/minimal sources;
- full-source veteran state;
- 10,000 irrelevant DailyAction/combat rows;
- invalid/non-eligible combat rows around valid threshold rows;
- optional source failure/fallback.

Budgets:

- grouped Fight/problem source: at most 5 statements;
- complete representative marker snapshot: at most 12 statements;
- history growth changes neither statement count nor hard candidate/result cap;
- exact marker states and fail-soft behavior remain unchanged.

### Route-level reuse

Instrument the services/repositories and Telegram method order for one synthetic update:

- Shynok static rules: one Friday snapshot, zero marker builds, ack before route-optional reads;
- marker-bearing location: one Friday snapshot and one full Fight overview maximum;
- DKR route: repeated guard/marker consumers reuse the pre-mutation snapshot, with an explicit fresh read after a mutation when required;
- Hero: zero marker builds.

## Avoid flaky wall-time assertions

Do not make local milliseconds the primary acceptance criterion. Use statement count, row/candidate caps, call order and semantic results. Production percentiles are evaluated only through the controlled observation runbook.
