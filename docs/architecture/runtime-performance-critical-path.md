# Runtime Performance Critical Path

## Principle

Kvestarnia latency is dominated by awaited database and Telegram work, not by CPU-heavy computation. A low CPU graph does not imply spare response capacity when long polling processes one update at a time and each update contains serial I/O waterfalls.

Optimize in this order:

1. remove repeated/N+1 reads;
2. avoid unused read models;
3. coalesce non-authoritative writes;
4. move best-effort fan-out after the actor response;
5. bound/index scheduler queues;
6. introduce low, constrained update concurrency only after race/write tests.

## Critical-path ownership

Each update should own a request-local read context for mutable pre-route facts. It may memoize an in-flight Promise for an identical pre-mutation view. It must not persist mutable player state across updates.

Allowed request-local reuse examples:

- pending Friday Barrel result;
- a full Fight overview already loaded by combat-lock middleware and needed unchanged by a marker consumer;
- a lazy quest-marker snapshot consumed by multiple presenters in the same route.

Invalidation is mandatory after a mutation that can change the cached fact. In the current callback paths, a newly started/completed Friday Barrel invalidates `pending-friday` before marker reconstruction, and a newly created next-problem issue invalidates `fight-overview`; replay/idempotent results retain the pre-route read. Late race-safe authorization must perform the task-defined authoritative recheck.

## Read budgets

Hot paths use actual SQL-statement budgets in integration tests. Count Prisma query events, not only service calls.

Initial 0.3.17 budgets:

- Friday pending snapshot: at most 3 SQL statements regardless of 24 periods/history;
- one pre-mutation Friday snapshot per update;
- grouped Fight/problem marker source: at most 5 statements;
- full marker snapshot fixture: at most 12 statements;
- static routes that do not show markers: zero marker calls.

Any history-dependent query must define a hard row/candidate cap or use a database aggregate. A threshold of 93 is not permission to load the full history and slice in JavaScript.

Shared marker snapshots must also declare what an absent row means. Exact key/local-date identities, bounded candidate dates, current-life prefixes, latest-per-key rows, bounded prefix rows/counts and current equipment identities may be answered from the snapshot only when that semantic selector was loaded; an unrelated global row cap must never turn an omitted authoritative row into a false absence.

## Telegram response milestones

A top-level trace records:

- first middleware entry;
- pre-route/guard/presence stages;
- first callback acknowledgement;
- first presentation send/edit;
- handler completion or terminal error.

Acknowledging early is correct only when the route does not need to return a state-dependent alert. Authoritative mutations must still validate/commit before a success response where the existing contract requires it.

For multi-recipient work, prefer:

1. authoritative commit;
2. actor ack/card;
3. bounded best-effort delivery;
4. per-chat order, failure isolation and shutdown drain.

## Telemetry privacy

Allowed route identity is a bounded enum/namespace. Never log:

- Telegram/user/chat/message ids;
- raw callback data, invite/session tokens or deep links;
- player/character/inventory/combat state;
- SQL text, parameters or database values;
- URLs, raw error messages or stacks.

SQL counts are required in isolated tests. Production traces contain timings and bounded stage/result classifications only unless a future concurrency-safe count attribution is explicitly designed and privacy-tested.

## SQLite rules

- Do not treat `Promise.all` as a query collapse.
- Keep write transactions narrow and avoid Telegram calls inside them.
- No full-history scans on callbacks or short scheduler ticks.
- Query actual PRAGMA and `EXPLAIN QUERY PLAN` before tuning.
- WAL and busy timeout are operational experiments, not substitutes for query reduction.
- Persistent-disk deployment is single-instance; a future PostgreSQL move is an architecture decision with migration/rollback evidence.

## Concurrency gate

`bot.start()` remains the safe default until:

- read/write amplification targets land;
- same-user and shared party/duel/raid tests pass under concurrent scheduling;
- SQLite busy/P1008 and duplicate mutation rates are observable;
- graceful shutdown drains update and outbound work.

When runner work is authorized, explicitly bound concurrency (start at 2, never inherit a high default) and install `sequentialize` before all existing middleware with user/chat/shared-entity constraints.
