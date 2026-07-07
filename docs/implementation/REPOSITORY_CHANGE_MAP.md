# Repository Change Map

This is a starting map, not permission for a repository-wide rewrite. Inspect current `main` before choosing exact files.

## Existing sources to inspect first

- `AGENTS.md`
- `docs/ai/context.md`
- `docs/phase2/GROUP_COMBAT_AND_RAIDS.md`
- `docs/history/early-raid/group-hook-design.md`
- `docs/architecture/group-raid-session-notes.md`
- `docs/balance/notes.md`
- `docs/architecture/security-and-fair-play.md`
- `src/services/tavernRaidService.ts`
- Barrel presenter/keyboard/notification scheduler files
- `src/services/presenceService.ts` and `src/bot/presence/presenceRouting.ts`
- nearby duel targeting/invite/deep-link flow
- turn-based duel state, repository, timeout scheduler and presenters
- `ActiveCombatLease` repository/guards
- shared combat action/ability/effective-stats helpers
- queued PvE drink/food/item-buff consumption
- item grant and loot candidate helpers
- current Prisma schema/migrations

## Likely new modules

Exact paths should follow the architecture state after stabilization.

```text
src/domain/raids/groupRaidSession.ts
src/domain/raids/bigBarrelBrother.ts
src/domain/raids/groupRaidBalance.ts
src/domain/raids/groupRaidContribution.ts
src/content/bigBarrelBrother.ts
src/services/groupRaidService.ts
src/db/repositories/groupRaidRepository.ts
src/db/repositories/prismaGroupRaidRepository.ts
src/bot/callbacks/groupRaidCallbackData.ts
src/bot/keyboards/groupRaidKeyboard.ts
src/bot/presenters/groupRaidPresenter.ts
src/bot/groupRaidRoundTimeoutScheduler.ts
src/tooling/groupRaidSimulation.ts
scripts/simulate-group-raid.ts
```

Tests should mirror each layer and include Prisma integration coverage.

## Existing modules likely to change

- bot composition/registrar for commands and callbacks;
- `/start` payload routing for opaque raid invite links;
- `👀 Хто поруч` target selection and private notices;
- Barrel command/service/presenter routing by level and feature flag;
- Barrel period/success helper extraction;
- active combat lock/lease recognition for `group-raid`;
- reward/item grant and affinity helpers;
- queued PvE buff activation eligibility;
- notification lifecycle;
- package scripts for group-raid simulation;
- docs, task index, compact Codex context, playtesting, security, technical plan, roadmap, changelog/news and package version for the actual release.

## Architecture boundaries

- Telegram imports stay outside `src/domain/`.
- Boss/round resolution accepts ordinary state + actions + RNG and returns ordinary result objects.
- Repository owns transactions/CAS, not presenters.
- Service owns orchestration, not Telegram HTML.
- Content owns names, barks, ability metadata, reward item definitions and validation.
- Presenters own Ukrainian HTML and must escape dynamic names.
- Scheduler invokes the same service transition as callbacks; it does not contain a second resolver.

## Refactor guard

If the current combat/application decomposition task was triggered before this feature, use the resulting use-case boundaries. Do not pull raid work back into a monolithic `FightService` or `createBot.ts` block.

If architecture stabilization has not landed, do not combine the architecture rewrite and production group raid in one PR. Implement the prerequisite first or narrow the party foundation to the current stable seams.

## Migration plan

Party foundation migration:

- session and participant tables;
- unique live membership keys/indexes;
- no production reward fields required beyond future-safe nullable JSON/status fields.

Boss runtime migration:

- round actions;
- participant rewards/settlement fields or table;
- due-round indexes;
- any explicit rules/balance version columns missing from foundation.

Never edit an old migration. SQLite and production PostgreSQL behavior, if both remain supported, must be covered by Prisma validation and realistic transaction tests.

## Release-surface checklist

For each actual versioned implementation:

- task doc renamed to the real version;
- `package.json` and lockfile in sync;
- `CHANGELOG.md` and `news.md` use the current Kyiv Holocene release date;
- `news.md` remains spoiler-light and omits exact rewards/formulas;
- `docs/ai/context.md` stays compact;
- `docs/operations/playtesting.md` gains the current manual path;
- `docs/balance/notes.md` records formulas and simulator command;
- `docs/architecture/security-and-fair-play.md` records invite/privacy/alt/idempotency policy;
- `docs/architecture/technical-plan.md` records models, scheduler and repair;
- `docs/product/roadmap.md` and deferred/group-raid docs reflect shipped versus deferred scope.
