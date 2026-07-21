# 0.3.17 Performance Observation

## Purpose

Measure callback acknowledgement and first-presentation latency after the 0.3.17 read-path collapse without exposing player data or confusing historical 0.3.11 evidence with a current baseline.

This runbook does not authorize deploys, environment changes or production shell access by itself.

## Preconditions

- The approved 0.3.17 commit is deployed.
- `/health` is healthy and `/ready` is ready.
- The observed `RENDER_GIT_COMMIT`/release identity matches the intended commit.
- No overlapping deploy or incident response is in progress.
- The new top-level trace has passed privacy tests.
- The operator has recorded the non-secret Render instance scope.

If any precondition fails, stop and record the blocker.

## Window

1. Record exact `T0` in UTC and Europe/Kyiv.
2. Set `KVESTARNIA_PERF_SAMPLE_RATE=1` only for the approved bounded window.
3. Observe for 60 minutes or until at least 100 complete target-route records exist, whichever is later, subject to the approved maximum window.
4. Record exact `T1`.
5. Restore `KVESTARNIA_PERF_SAMPLE_RATE=0` immediately after the window and verify the effective value.

If fewer than 100 target records are collected, label percentile/slow-rate conclusions underpowered. The data can still identify structural failures or regressions.

## Target cohorts

Report separately:

- static Shynok rules/local menus;
- Hero;
- marker-free location routes;
- marker-bearing location routes;
- quest-marker snapshot;
- fight turn, separating ordinary and reward/terminal turns;
- pending-Friday blocked and no-pending routes;
- DKR scene/marker routes.

Do not combine read-only static callbacks with mutations or recipient fan-out.

## Fields

For each cohort, aggregate only sanitized trace fields:

- complete/success/error/slow counts;
- p50/p95 `ackMs` where an ack exists;
- p50/p95 `firstPresentationMs`;
- p50/p95 `totalMs`;
- mean/percentile `preRouteMs`, `pendingRaidMs`, `combatLockMs`, `presenceMs` when present;
- terminal error component/category;
- effective sample rate and slow threshold;
- deployed commit and non-secret instance id.

Never export or retain raw ids, callback payloads, SQL, player values, URLs, raw messages or stacks.

## Structural success gates

Before interpreting percentiles, confirm from tests/release evidence:

- Friday lookup is at most 3 SQL statements in every required fixture;
- one pre-mutation Friday lookup per update;
- static Shynok/Hero/marker-free routes build no quest markers;
- a marker-bearing update loads a full Fight overview at most once;
- full check and query-budget integration tests passed on the final commit.

## Runtime success gates

- No increase in Prisma P1008/SQLite busy class, duplicate mutation, stale callback or terminal repair errors.
- Static callback p95 `ackMs` and `firstPresentationMs` materially improve against a like-for-like pre-0.3.17 window if one with identical telemetry exists.
- `pendingRaidMs` is no longer history/period-count shaped.
- Marker-free routes show zero marker stage.
- No privacy field violation appears.

Historical 0.3.11 values may be listed only as context, never as a like-for-like baseline for the new top-level fields.

## Optional read-only SQLite facts

With explicit production-shell authorization, record only aggregate/non-secret diagnostics using a read-only connection:

```sh
sqlite3 'file:/var/data/kvestarnia.db?mode=ro' 'PRAGMA journal_mode; PRAGMA synchronous; PRAGMA busy_timeout; PRAGMA page_count; PRAGMA freelist_count;'
```

Also record aggregate row counts for relevant tables/keys and `EXPLAIN QUERY PLAN` for the new exact-key batches. Do not copy the database, row payloads, ids, SQL parameters or raw query results into the repository or PR.

Do not set PRAGMA, checkpoint, vacuum, migrate or restart the service as part of observation.

## Report

The sanitized report must include:

- exact commit(s), instance scope and `[T0,T1)` in UTC/Kyiv;
- effective configuration;
- cohort definitions and inclusion/exclusion rules;
- counts and percentiles;
- error rates;
- whether each structural/runtime gate passed;
- limitations and underpowered cohorts;
- final confirmation that sample rate returned to 0.
