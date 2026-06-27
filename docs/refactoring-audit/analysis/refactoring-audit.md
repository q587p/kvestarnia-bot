# Refactoring Audit — Kvestarnia `0.2.7` Player Abilities MVP

## Baseline

Observed repo: `q587p/kvestarnia-bot`.
Observed main snapshot: `0.2.6 — Passage Search MVP` on `main`.
Active user context: `0.2.7 — Player Abilities MVP`.

Important mismatch: `package.json` still reports `0.2.6` on the observed `main`. Treat the `0.2.7` work as the next branch/release task unless a newer branch already exists locally.

## Executive verdict

The codebase is not in “rewrite it all” territory. It has a good architecture direction:

- bot adapter / services / domain / content / db layers are explicit;
- `src/domain` is protected from Telegram imports;
- repository interfaces isolate Prisma;
- tests already pin critical architectural contracts;
- recent gameplay slices show strong idempotency and replay-safety discipline.

The current problem is **growth pressure around orchestration and ability contracts**, not a failed stack.

The safest refactoring sequence is therefore:

1. Use the Player Abilities MVP to formalize player-side combat abilities as a registry.
2. Reduce repeated bot callback ceremony with tiny local helpers.
3. Split high-arity constructors and `FightService` internals only through facade-preserving moves.
4. Delay broad route unification, monster runtime rewrites, event buses, DI containers, or data-store changes until measurements or feature scope require them.

## What changed since the old architecture audit

The old audit identified `createBot.ts` as a P0 hotspot. That part has been largely solved:

- `src/bot/createBot.ts` now creates the bot, installs cross-cutting middleware, calls vertical feature registrars, resumes notifications, and returns the bot.
- `tests/scope/architectureStabilizationScope.test.ts` pins the ordered module invocation, callback prefix ownership, command aliases, and module-cycle rules.

So do not spend the next refactor budget on another bot-assembly rewrite. The new hotspots are downstream of the split.

## Current hotspot order

### P0 — Player ability registry

File: `src/domain/combat/combatActions.ts`.

Why now:

- The active work is `0.2.7 — Player Abilities MVP`.
- `getCombatSkillProfile(classId)` is still a switch that returns hard-coded class skill profiles.
- The file already has `CombatAbilityDefinition`, `CombatSkillProfile`, and basic ability helpers, so it is ready for a small registry without changing stored combat JSON.

Recommended shape:

- Introduce a `PLAYER_COMBAT_ABILITIES` registry keyed by stable ability ID.
- Introduce `CLASS_COMBAT_ABILITY_BY_CLASS_ID` or an equivalent lookup.
- Keep `getCombatSkillProfile(classId)` as a compatibility facade.
- Preserve `legacyCooldownIds` for renamed Mage/Varenyk-mancer and Ranger/Rogue skills.
- Add a visible label resolver so keyboards/cards do not need to use raw IDs.
- Do not ship race/title/signature/item ability catalogs in the same slice unless the task explicitly says so.

Acceptance signal:

- Existing combat behavior is unchanged for current class skills.
- New ability data is discoverable and testable without reading a switch.
- Later player abilities can be added by editing a registry, not branching the combat engine.

### P0/P1 — Callback route helper, not a central router

Files: `src/bot/modules/{combat,inventory,tavern,quest,character}.ts`.

The 0.2.2 split is good, but several modules now repeat this pattern:

1. register callback regex;
2. parse callback data;
3. if parse fails, answer with `presentInvalidCallback()`;
4. extract `telegramUserId`;
5. check active passage search / pending raid when relevant;
6. answer callback;
7. edit or reply with presenter + keyboard.

Recommended helper:

- `registerParsedCallbackRoute` or `createCallbackRouteHandler` living under `src/bot/callbacks/` or `src/bot/modules/callbackRoute.ts`.
- It should handle parse failure consistently and optionally run named guards.
- It must not centralize feature ownership or callback namespace routing.
- It must keep the current architecture tests meaningful: ownership stays in vertical modules.

Acceptance signal:

- `social.ts` stays small and mostly unchanged.
- `inventory.ts`, `quest.ts`, `tavern.ts`, and `combat.ts` lose boilerplate, not feature logic.
- The architecture scope test is updated to allow the helper while still rejecting a recreated `featureRegistrars.ts` style router.

### P1 — Named service dependencies

File: `src/app/createServices.ts` and constructors such as `FightService` and `TrainingDoppelgangerService`.

Problem:

- Several constructors still use positional arguments with `undefined` placeholders.
- This makes future refactors risky because adding one optional capability can silently shift a parameter or make tests incomplete.

Recommended shape:

- Add a named `FightServiceDependencies` object.
- Migrate one high-arity service at a time.
- Keep runtime wiring in `createServices()` explicit; do not introduce a DI container.

Acceptance signal:

- No behavior changes.
- Tests still pass.
- Constructor call sites become self-documenting.

### P1 — Facade-preserving `FightService` split

File: `src/services/fightService.ts`.

Problem:

- `FightService` has become a huge application facade for starter combat, persistent combat, passage previews, turn resolution, settlement, rewards, problem quest stages, Yeger/adventure source behavior, monster rest, analytics, recovery, and item integration.

Do **not** split it deeply inside the Player Abilities MVP unless the ability work forces it.

Recommended sequence:

1. Add characterization tests around any behavior that will move.
2. Extract pure problem-quest definitions and helper functions first.
3. Extract reward/result helpers second.
4. Extract encounter/session coordinators later, preserving transaction ownership.
5. Keep `FightService` public methods stable for bot commands and schedulers.

Acceptance signal:

- `FightService` is smaller because collaborators own coherent workflows.
- Public result unions remain compatible.
- Exactly-once reward/resource settlement remains clearly owned.
- No Telegram types enter domain.

### P2 — Monster/player ability contract convergence

Files: `src/domain/combat/monsterAbilityRuntime.ts`, `src/domain/combat/combatEngine.ts`, `src/domain/combat/combatState.ts`.

Monster ability runtime is large and sophisticated. Do not reshape it as part of the first player ability registry unless needed.

Later, introduce a small shared ability vocabulary only where it is actually shared:

- ability ID;
- source actor (`player`, `monster`, later `item`);
- target scope;
- cost/cooldown;
- tags;
- deterministic resolver contract.

Avoid forcing player abilities into monster runtime plans too early. The systems are adjacent, not identical.

### P2/P3 — Measurement before infrastructure

Do not add Redis, BullMQ, webhooks, a DI framework, microservices, generic event bus, or a new database just because the code is large.

Add instrumentation first:

- callback latency by namespace;
- database query count for high-traffic actions;
- timeout scheduler lag;
- failed edit/reply rates;
- balance analytics for ability usage.

Then decide whether queueing, batching, or persistence changes are justified.

## First queue

1. `tasks/player-abilities-registry.md`
2. `tasks/bot-callback-route-helper.md`
3. `tasks/service-constructor-dependencies.md`

## Second queue

1. `tasks/fight-service-facade-split.md`
2. `tasks/player-monster-ability-contract-map.md`
3. `tasks/observability-and-balance-metrics.md`

## Later / only with evidence

- shared route policy engine;
- monster runtime decomposition;
- database migration unrelated to a feature;
- global folder reshuffle;
- framework adoption;
- Mini App UI or real raid runtime as a refactor task.
