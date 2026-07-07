# Codex Prompt — Combat Engine Implementation for Квестарня

Use this prompt after `docs/architecture/combat-engine-design.md` is merged or as a branch stacked on top of it.

## Goal

Implement the first real solo PvE combat engine for Квестарня without losing the design constraints from `docs/architecture/combat-engine-design.md`.

The result must replace the current safe `/fight` probe with a persistent, turn-based, Telegram-friendly combat session that supports meaningful actions, timeout/auto-actions, basic resource costs, victory/loss/flee outcomes and safe idempotency. Keep the first implementation small; do not ship group raids, PvP, shops, trading, crafting, item-to-level exchange, full economy, guilds, huge random loot tables, or complex status trees in the same PR.

## Read first

- `AGENTS.md`
- `README.md`
- `docs/design/game-design.md`
- `docs/balance/notes.md`
- `docs/architecture/technical-plan.md`
- `docs/design/content-style-guide.md`
- `docs/architecture/security-and-fair-play.md`
- `docs/ai/codex-workflow.md`
- `docs/design/combat-action-variants-plan.md` if present
- `docs/architecture/combat-engine-design.md`
- Existing fight/combat files, likely:
  - `src/domain/combat/combatProbe.ts`
  - `src/services/fightService.ts`
  - `src/bot/presenters/fightPresenter.ts`
  - `src/bot/createBot.ts`
  - callback parser/helpers
  - tests for fight, hero, equipment, presence and scene callbacks

If any listed file does not exist, inspect the nearest equivalent and mention the mismatch in the PR summary.

## Current state assumptions

- The project is TypeScript/Node.js with grammY, Prisma, SQLite, Zod, Vitest and strict TypeScript.
- `/fight` and `/hunt` currently behave as a safe combat probe, not a full persistent combat state machine.
- Equipment shell exists, but stat effects may still be intentionally off depending on branch state.
- Existing docs require combat to be domain-driven, deterministic, short, idempotent and Ukrainian in all player-facing text.

## Product requirements

### Combat feel

- Solo PvE first.
- Normal fights should average 2–5 player choices.
- Each player action resolves the player move, enemy reaction and next state in one Telegram callback.
- Keep messages short enough for mobile Telegram.
- Use humor, but do not hide important numbers.

### Actions

Implement a small action catalog with at least:

1. `physical` — stable attack using level, STR/DEX and weapon/effective stats.
2. `spell` or class-special resource action — costs mana and clearly shows `🔮 -N мани` in UI.
3. `trick` or `social` — lower direct damage but debuff/control/surrender/refusal setup.
4. `guard` — reduces incoming damage and can recover a tiny amount of mana/focus.
5. `escape` — can end combat as `fled`, no XP.

Not every class needs unique mechanics in the first PR, but presenter text and action names should already allow class/race flavor. Do not leave everyone with only one generic «Вдарити» button.

### Outcomes

Support statuses:

- `active`
- `won`
- `lost`
- `fled`
- `expired`

Add `surrendered`/`refused` only if the PR stays small and tested. Otherwise, define the status union and docs/tests as future TODO, but do not fake untested behavior.

Victory gives XP/gold/loot through one idempotent reward path. Flee/loss/expired do not steal valuable items. Refusal/surrender, when implemented, must not grant combat XP.

### Timeout and auto-actions

Implement timeout behavior in a safe minimal way:

- Store `nextTimeoutAt`, `missedTurns`, `autoTurnCount`, `hardExpiresAt` in combat state.
- Add `advanceCombatTimeout(combatId)` in service/domain.
- If the player does not react for roughly 23 seconds after the combat prompt, try a safe auto-action from the available set instead of immediately expiring the fight.
- First missed turn uses a safe default action.
- Second missed turn guards or tries to flee.
- Third missed turn or hard expiry ends as `expired`/safe flee with no reward.
- In-process timers are allowed as best-effort notification, but service state is source of truth.
- Lazy fallback: starting/resuming/clicking combat after `nextTimeoutAt` must advance overdue state before accepting a stale player action.
- Repeated timeout calls for the same turn must be idempotent.

### Data and persistence

Use or add a `combats` table/model consistent with docs:

- `id`
- `characterId`
- `monsterId`
- `stateJson`
- `status`: active/won/lost/fled/expired/surrendered/refused as implemented
- `idempotencyKey` or equivalent idempotent reward keys
- timestamps

If the schema already contains a documented but not migrated model, implement the smallest safe migration. Do not mutate old migrations.

Combat `stateJson` must include enough data to resume a fight after process restart:

- seed/RNG state or materialized rolls;
- turn number and expected turn token;
- player combat HP/mana;
- enemy HP/status;
- effects/cooldowns if any;
- timeout fields;
- action log summary;
- materialized reward after finish.

### Callback data

Telegram callback data must stay short and versioned. Prefer tokenized payloads such as:

```text
v1:cbt:a:{token}:{actionCode}
v1:cbt:f:{token}
```

Always validate token ownership, active combat, expected turn and action availability server-side. Never trust button text or stale presenter data.

### Idempotency

Mutation paths must be transactional:

- repeated action callback for the same turn returns already-resolved/current state;
- stale callback does not reroll damage or rewards;
- repeated finish/reward callback does not duplicate XP, gold or items;
- spell with insufficient mana does not spend mana or consume the turn;
- timeout advancement for the same turn does not run twice.

Suggested keys:

```text
combat:{combatId}:turn:{turn}:action:{actionCode}
combat:{combatId}:timeout:{turn}
combat:{combatId}:finish
combat:{combatId}:reward
```

### Balance

Start with simple formulas from `docs/architecture/combat-engine-design.md` / `docs/balance/notes.md`. Keep numbers tiny. Do not chase perfect balance in the implementation PR, but add enough tests/simulations to catch obvious outliers.

The `coward` scenario must have an explicit flee threshold in service logic and tests. Do not hide it in presenter-only text; if the hero is low HP or the enemy is cowardly, the timeout ladder may prefer `escape` earlier than `attack`.

Add or update a simulation script if practical:

```bash
npm run simulate:combat -- --levels 1-13 --runs 10000
```

If adding the script is too much for this PR, add domain tests that approximate:

- win rate sanity for level-equal starter fights;
- average turns not above 8;
- all classes have at least one useful action;
- no race/class combo has an obvious impossible fight in starter content.

## Implementation order

1. Inspect current fight probe and tests.
2. Add/prepare combat domain types and pure resolver.
3. Add persistent combat session service.
4. Add Prisma model/migration only if needed.
5. Add callback parser and presenter updates.
6. Wire `/fight` and `/hunt` to start/resume active combat.
7. Implement timeout advancement with lazy fallback; add best-effort timer only if small.
8. Add tests for domain, service transaction/idempotency, callback parser and presenter.
9. Update docs with what shipped and what remains future.

## Do not implement in this PR

- Group raids.
- PvP / Бойовий куток.
- Guilds.
- Shops, selling, trading, crafting.
- Item-to-level exchange.
- Complex item instance state.
- Public web combat UI or Mini App UI.
- Pay-to-win or paid power.
- Permanent loss of valuable items.
- Full status-effect encyclopedia.
- Dozens of monsters; 1–3 well-tested enemies are enough.

## Required tests

At minimum:

- domain resolves physical/spell/trick/guard/escape deterministically;
- mana cost is displayed and applied once;
- insufficient mana does not mutate turn;
- stale callback is safe;
- timeout first miss auto-resolves exactly once;
- hard expiry gives no reward;
- victory reward is idempotent;
- flee/loss gives no XP and no item loss;
- hidden path names do not leak into player-facing combat text;
- all player-facing strings are Ukrainian and short.

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If the project has `npm run check`, run that too. If any command cannot run, state the exact blocker.

## PR response format

Final response must include:

1. Summary.
2. Combat behavior shipped.
3. Files changed.
4. Tests run with results.
5. Balance notes and known risks.
6. Explicitly not included.
7. Next smallest useful step.

## Acceptance criteria

The PR is acceptable when a player can:

1. start `/fight`;
2. choose between several meaningful actions;
3. spend mana safely on at least one action;
4. guard or flee;
5. let a turn timeout and see an auto-action or expiry;
6. resume an active combat without duplicating state;
7. finish with victory/loss/flee and correct idempotent rewards;
8. see Ukrainian text that sounds like Квестарня, not a generic RPG bot.
