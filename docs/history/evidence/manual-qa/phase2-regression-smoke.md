# Phase 2 Regression Smoke

## Goal

Prove that the shipped social-combat vertical slice remains coherent after `0.1.24`, with no duplicate rewards, broken leases, presence leaks or cross-mode drink power.

## Scope

- Current `main` after `0.1.24`.
- Two normal characters plus one remorted fixture where available.
- Quick duel, turn-based duel, nearby targeting, rematch/share.
- Solo fight, passage preview memory, survivor re-attack and settlement.
- Shynok interactions and combat isolation.
- Remort and active-combat boundaries.
- Stale and duplicate callbacks.

## Non-goals

- New gameplay.
- Broad balance tuning.
- Multi-enemy.
- Trading.
- Party/raids.
- Copy polish unrelated to correctness.

## Acceptance criteria

- All blocker rows in the smoke matrix pass.
- Duplicate callbacks never duplicate XP, gold, items, drinks, sales, duel actions or rewards.
- Active leases block incompatible starts and recover canonical state.
- Quick and turn-based duel terminal replay is stable.
- Shynok drink power never affects PvP/training/starter.
- Remort cannot leave a prior-life active session/reward path.
- Presence remains location-scoped without exact-location public leaks.
- Production-like restart does not orphan a mutable terminal state.

## Automated checks

```bash
npm run db:validate
npm run lint
npm run typecheck
npm run build
npm test
npm run check
git diff --check
```

Run focused suites for:

- duel challenge/session repository and service;
- combat timeout scheduler;
- fight/training services;
- presence routing and nearby duel;
- remort service;
- Shynok domain/repository/service;
- reward replay and stale callback integration.

## Output

A compact matrix:

| Flow | Pass/Fail | Evidence | Bug/task |
|---|---|---|---|

Only P0/P1 issues block closeout. Everything else gets a named deferred task.
