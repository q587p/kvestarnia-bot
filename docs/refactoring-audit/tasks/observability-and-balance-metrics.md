# Observability and Balance Metrics

## Goal

Add lightweight measurements before making infrastructure or combat-balance decisions.

## Scope

Candidate metrics:

- callback latency by namespace;
- failed Telegram edit/reply count by operation;
- timeout scheduler due-lag;
- combat turn count, ability usage, unavailable-skill attempts;
- query-count probes in focused tests or local diagnostics;
- opt-in balance analytics expansion for player ability IDs.

## Non-goals

- No Redis/BullMQ migration.
- No webhook migration.
- No production dashboard dependency unless explicitly approved.
- No collection of private Telegram content.
- No player-identifying analytics.
- No gameplay change.

## Acceptance criteria

- Metrics are opt-in or low-risk.
- No PII or raw player copy is recorded.
- Failures never block gameplay.
- Data is useful for deciding whether performance/infrastructure work is needed.

## Relevant files / search terms

- `src/services/combatBalanceAnalyticsService.ts`
- `src/db/repositories/prismaCombatBalanceAnalyticsRepository.ts`
- `src/bot/safeEditMessageText.ts`
- `src/bot/safeAnswerCallbackQuery.ts`
- combat timeout scheduler
- `COMBAT_BALANCE_ANALYTICS_ENABLED`

## Focused tests

- metrics disabled by default;
- metric failure does not fail gameplay;
- no Telegram IDs/usernames/display names stored;
- idempotent combat completion still writes once.

## Manual QA

Run one combat and one callback-heavy flow with metrics disabled; confirm no visible behavior change.

## Release surfaces

Technical changelog only if runtime metrics ship. Do not put operational metrics in player news.
