# Refactoring Principles for Kvestarnia

## 1. Facade first, internals later

When a class is a public integration point, keep its public API stable while moving implementation behind collaborators. This especially applies to `FightService`, command handlers, and schedulers.

## 2. Preserve server-authoritative gameplay

The server owns all authoritative state:

- callback tokens are hints, not truth;
- current location/session/remort/life state is re-read before mutation;
- rewards and resources are settled exactly once;
- terminal outcomes replay instead of rerolling;
- stale buttons refresh or explain, they do not silently mutate.

## 3. Refactor around tests, not vibes

Before moving stateful logic, add characterization tests for:

- duplicate callback presses;
- stale callback data;
- reward replay;
- active fight/search/raid conflicts;
- remort/reset behavior;
- stored legacy combat rows;
- timeout scheduler behavior;
- resource settlement.

## 4. Keep domain pure

`src/domain/` receives ordinary data and returns ordinary data. It must not import grammY, bot presenters, Prisma clients, or Telegram contexts.

Use:

- `src/domain/` for deterministic rules;
- `src/services/` for application workflows with repositories, clocks, RNG, idempotency, and settlement;
- `src/bot/` for Telegram routing, keyboards, presenters, and message editing.

## 5. Use named dependencies before splitting services

A named dependency object is a low-risk refactor that makes future extraction safer. Do this before moving complex workflows out of `FightService`.

Good:

```ts
new FightService({
  characters,
  dailyActions,
  soloCombatSessions,
  equipment,
  analytics,
  pendingPassageEncounters,
  shynok
});
```

Risky:

```ts
new FightService(characters, dailyActions, undefined, soloCombatSessions, undefined, equipment, analytics, pending, shynok);
```

## 6. Avoid false abstraction

Do not add these as “refactoring” unless a task proves the need:

- DI container;
- generic repository abstraction over Prisma;
- CQRS/event-sourcing framework;
- global route policy engine;
- microservices;
- broad folder renames;
- line-count gates as a sole success criterion.

## 7. Keep player-facing copy Ukrainian

Refactors should not accidentally change tone, grammar, or copy. If the task does change player-facing text, use the Ukrainian RPG content workflow and add presenter tests for critical surfaces.

## 8. Small PRs beat heroic PRs

A good refactor PR should be reviewable by checking:

- moved code parity;
- contract tests;
- no behavior claims beyond the task;
- no schema/migration unless explicitly needed;
- no unrelated formatting churn;
- no large dependency additions.
