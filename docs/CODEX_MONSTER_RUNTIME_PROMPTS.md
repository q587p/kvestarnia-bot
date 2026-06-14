# Codex Monster Runtime Prompts

Нижче — copy-paste prompts для майбутніх runtime PR. Вони сконструйовані так, щоб наступний Codex не мусив щоразу вигадувати scope заново.

## Prompt 1 — `0.0.18 — Hunt Board Polish & Result Variety`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Polish the first Hunt Board runtime slice by making hunt results more varied and readable, without adding a new schema or random loot engine.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/HUNT_BOARD_FOLLOWUP_PLAN.md
- docs/MONSTER_ENCOUNTER_AUTHORING_GUIDE.md
- docs/MONSTER_REWARD_AND_LOOT_BALANCE.md
- src/services/huntService.ts
- src/bot/presenters/huntPresenter.ts
- src/bot/callbacks/huntCallbackData.ts
- src/content/monsters.ts
- src/content/monsterFlavor.ts
- tests/**

Required changes:
- keep `/hunt` as one deterministic monster per Kyiv-local day;
- add richer success / partial success / fallback result text;
- add 2–3 action choices per monster where the current flow supports it;
- keep item grants deterministic and tied to the current hunt identity;
- improve the “already hunted today” UX so it explains the current state clearly;
- keep the code path idempotent.

Non-goals:
- no new schema;
- no random loot engine;
- no persistent combat state;
- no equipment effects;
- no group hunt flow;
- no PvP;
- no Redis requirement unless the current code already needs it.

Safety / privacy / balance guardrails:
- stale callbacks must not reroll or duplicate rewards;
- keep all player-facing text Ukrainian;
- do not expose hidden path ids or internal technical keys in player text;
- do not make `/hunt` obviously better than barrel/cellar loops;
- do not add stat bonuses in flavor text.

Tests to run:
- the smallest relevant unit and presenter tests;
- hunt callback parser tests;
- idempotency tests for repeated callbacks;
- `git diff --check`;
- the repo’s normal `npm run check` or the equivalent checked in package scripts.

Final response format:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 2 — `0.0.19 — Monster Encounter Rotation Pack`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Expand the monster roster and deterministic rotation pack after the Hunt Board MVP, while keeping the rotation small, readable, and content-driven.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BESTIARY.md
- docs/MONSTER_FLAVOR_ROUTING.md
- docs/MONSTER_LOOT_DROPS.md
- docs/MONSTER_ENCOUNTER_AUTHORING_GUIDE.md
- docs/MONSTER_REWARD_AND_LOOT_BALANCE.md
- src/content/monsters.ts
- src/content/monsterFlavor.ts
- src/content/monsterLootItems.ts
- tests/content/**

Required changes:
- add a larger deterministic monster rotation with simple level bands;
- keep flavor hooks readable and short;
- keep loot mapping content-only;
- keep selection deterministic and testable;
- do not introduce power scaling yet.

Non-goals:
- no combat rework;
- no random loot engine;
- no schema changes;
- no persistent combat state;
- no group hunt system;
- no hidden stat bonuses.

Safety / privacy / balance guardrails:
- all player-facing text must remain Ukrainian;
- monster ids must stay stable;
- hidden path labels stay internal;
- do not copy or lightly paraphrase copyrighted character names or signature scenes;
- maintain reward pacing so hunt does not outcompete barrel or cellar loops.

Tests to run:
- content validation tests;
- unique id / mapping completeness tests;
- deterministic flavor selection tests;
- `git diff --check`;
- the repo’s checked-in test command set.

Final response format:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 3 — `0.0.20 — Combat Action Variant Shell`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Introduce typed combat action variants as a small shell: the UI can show action identity and mana cost, but the game does not yet need full persistent combat or large stat effects.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/COMBAT_ACTION_VARIANTS_PLAN.md
- docs/EFFECTIVE_STATS_AND_EQUIPMENT_EFFECTS_PLAN.md
- docs/TECHNICAL_PLAN.md
- src/domain/combat/combatProbe.ts
- src/services/fightService.ts
- src/bot/presenters/fightPresenter.ts
- src/content/classes.ts
- src/content/monsters.ts
- tests/**

Required changes:
- replace the single generic fight action shape with typed variants such as physical, spell, social, trick, and optional class-special;
- show action identity and mana cost in the UI, for example `🔮 -2 мани`;
- keep callbacks idempotent;
- keep the implementation small and testable.

Non-goals:
- no persistent HP/mana loss system yet unless explicitly scoped;
- no full combat engine;
- no equipment effects;
- no stat rebalance;
- no group combat;
- no random loot engine.

Safety / privacy / balance guardrails:
- repeated or stale callbacks must not spend mana twice;
- do not hide actual rules inside presenter-only text;
- keep player-facing text Ukrainian;
- avoid one-correct-build incentives;
- no hidden path labels or external IP references in action copy.

Tests to run:
- action parser tests;
- presenter snapshot or text tests;
- no-double-spend tests;
- `git diff --check`;
- the repo’s checked-in test command set.

Final response format:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```

## Prompt 4 — `0.0.21 — Effective Stats Helper Guardrail`

```text
Read AGENTS.md first.

You are the primary Codex agent working on Kvestarnia.

Goal:
Add a single effective-stats helper that combines base character stats, level bonuses, and future equipment shell data, but do not expose public buffs yet unless the PR explicitly opts in.

Read before changing code:
- AGENTS.md
- README.md
- docs/GAME_DESIGN.md
- docs/BALANCE_NOTES.md
- docs/EFFECTIVE_STATS_AND_EQUIPMENT_EFFECTS_PLAN.md
- docs/TECHNICAL_PLAN.md
- src/services/heroService.ts
- src/services/equipmentService.ts
- src/services/fightService.ts
- src/bot/presenters/heroPresenter.ts
- src/domain/characters/**
- tests/**

Required changes:
- implement a single helper/API shape for effective stats;
- make the helper read base stats, level bonuses, equipped items, and optional scene/combat context;
- return transparent contribution lines when useful;
- keep `/hero` and existing reward / cooldown logic unchanged unless the PR explicitly opts in to new effective presentation;
- keep the helper reusable for future combat and equipment work.

Non-goals:
- no visible equipment buffs yet unless explicitly scoped;
- no combat overhaul;
- no schema overdesign for item instances;
- no random loot engine;
- no persistent combat state rewrite.

Safety / privacy / balance guardrails:
- do not compute stat effects directly inside presenters;
- no hidden stat changes in `/hero`;
- junk, cosmetic, and priceless trophies must not become combat power by accident;
- armor should help survival, not free damage;
- accessory effects should stay tiny and situational;
- equipment effects must be simulation-tested before combat uses them.

Tests to run:
- helper unit tests;
- regression tests for `/hero`;
- fight math regression tests;
- reward and cooldown regression tests that prove unchanged behavior where required;
- `git diff --check`;
- the repo’s checked-in test command set.

Final response format:
1. Summary
2. Files changed
3. Tests run
4. Risks / follow-ups
5. Suggested next PR
```
