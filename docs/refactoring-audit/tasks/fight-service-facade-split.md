# FightService Facade-Preserving Split

## Goal

Keep `FightService` as the stable application facade while extracting one coherent internal responsibility at a time behind tests.

## Scope

Recommended first extraction:

- problem quest definitions and pure progress helpers, or
- reward construction/replay helpers, or
- passage encounter selection policy if tests already cover it.

Rules:

- Add characterization tests before moving logic.
- Keep public methods consumed by bot commands, Yeger service, passage search, and schedulers stable.
- Keep transactions and compare-and-set boundaries explicit.
- Keep Telegram presentation outside services.
- Keep repository-aware workflows in `src/services/fight/`, not `src/domain/`.

## Non-goals

- No new combat mechanics.
- No ability registry work if that is already a separate task.
- No reward/economy rebalance.
- No stored combat JSON shape change.
- No schema/migration unless a compatibility blocker is proven.
- No event bus/CQRS/framework.
- No player-facing copy change.

## Acceptance criteria

- Existing fight start/turn/result behavior remains unchanged.
- Existing problem quest, Yeger, Adventure complication, passage preview, timeout, settlement and replay tests pass.
- `FightService` becomes smaller because a coherent collaborator owns a workflow.
- Import cycles are not introduced.
- The facade still exposes the same behavior-level contract to bot modules.

## Relevant files / search terms

- `src/services/fightService.ts`
- `src/services/fight/`
- `SoloCombatSessionRepository`
- `PendingPassageEncounterRepository`
- `GuardedSettlementOutcome`
- `reward replay`
- `problem quest`
- `turnInProblemQuestForTelegramUser`
- `issueNextProblemQuestForTelegramUser`
- `resolvePersistentFightTurn`
- `completeDuePersistentFightTurn`
- `remort life`

## Focused tests

- ordinary fight start and restore;
- duplicate turn;
- stale turn;
- timeout auto-defend;
- win reward replay;
- loss/flee/expiry settlement;
- remort-life mismatch;
- problem quest issue/progress/turn-in;
- Yeger target fight;
- Adventure complication handoff;
- passage preview consume/re-attack;
- analytics exactly-once if touched.

## Manual Telegram QA

- Start ordinary Nyz fight.
- Take manual turns.
- Let a timeout resolve.
- Win and replay terminal card.
- Try problem quest progress/turn-in.
- Try Yeger fight if touched.
- Try Adventure complication if touched.

## Release surfaces

Use changelog/technical docs if release-oriented. Do not put pure internal decomposition in player news unless behavior becomes visible.
