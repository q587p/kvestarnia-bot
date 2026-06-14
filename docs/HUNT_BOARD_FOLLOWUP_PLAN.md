# Hunt Board Follow-up Plan

Цей план описує маленькі наступні slices після першого deterministic Hunt Board MVP.

## Чому саме такий порядок

Перший Hunt Board має бути простим: один визначений monster of the day за київським локальним днем, один reward-bearing hunt на персонажа на день, без persistent combat state і без random loot engine.

Після цього ми рухаємось так:

1. спершу поліпшуємо читабельність і відчуття результату;
2. потім розширюємо roster і level bands;
3. далі додаємо typed action metadata;
4. лише після цього підводимо helper для effective stats;
5. і вже потім думаємо про маленькі equipment effects, persistent combat та group hooks.

## 0.0.18 — Hunt Board Polish & Result Variety

**User-facing impact:**  
Гравець бачить не просто «перемога/поразка», а трохи багатшу сцену з різними результатами, більш живим monster text і зрозумілим повідомленням про те, що сьогодні hunt вже вичерпано.

**Files likely to change:**  
`src/services/huntService.ts`, `src/bot/presenters/huntPresenter.ts`, `src/bot/callbacks/huntCallbackData.ts`, `src/content/monsters.ts`, `src/content/monsterFlavor.ts`, `tests/services/huntService.test.ts`, `tests/bot/huntPresenter.test.ts`.

**Tests required:**  
- unit tests для результатів `success / partial / fallback`;
- callback parser tests;
- idempotency tests для повторного натискання;
- presenter tests на компактність тексту.

**Explicit non-goals:**  
- нова schema;
- random loot engine;
- persistent combat state;
- equipment effects;
- group chat flow.

**Risk notes:**  
Не роздути результат до «малого кінця світу». Hunt має лишатися коротким, корчемним і дуже Telegram-friendly.

## 0.0.19 — Monster Encounter Rotation Pack

**User-facing impact:**  
З’являється більший deterministic rotation: більше монстрів, чіткі level bands, менше відчуття, що один і той самий лаваш переслідує нас вічно.

**Files likely to change:**  
`src/content/monsters.ts`, `src/content/monsterFlavor.ts`, `src/content/monsterLootItems.ts`, `docs/BESTIARY.md`, `docs/MONSTER_LOOT_DROPS.md`, `tests/content/monsterFlavor.test.ts`.

**Tests required:**  
- content table validation;
- unique id checks;
- monster-to-loot mapping completeness;
- deterministic selection tests.

**Explicit non-goals:**  
- power-scaling;
- combat rework;
- random loot table engine;
- stat bonuses;
- live balancing dashboard.

**Risk notes:**  
Rotation should feel larger, але не «випадково-хаотичний». Якщо один монстр явно сильніший, це має бути видно з level band, а не з магії в коді.

## 0.0.20 — Combat Action Variant Shell

**User-facing impact:**  
Кнопки й тексти починають показувати тип дії: `physical`, `spell`, `social`, `trick`, `class-special`. Мана cost може відображатися як `🔮 -2 мани`, але ще без повного persistent combat loss.

**Files likely to change:**  
`src/domain/combat/*`, `src/services/fightService.ts`, `src/bot/presenters/fightPresenter.ts`, `src/bot/callbacks/fightCallbackData.ts`, `src/content/classes.ts`, `tests/domain/combat/*.test.ts`, `tests/bot/fightPresenter.test.ts`.

**Tests required:**  
- action-variant parser tests;
- presenter tests на cost labels;
- no-double-spend callback tests;
- shape tests для class-special metadata.

**Explicit non-goals:**  
- повний combat engine;
- HP/mana loss persistence;
- equipment effects;
- balance overhaul;
- group combat.

**Risk notes:**  
Не сховати тип дії в presenter-only тексті. Тип має бути даними, щоб наступні механіки могли ним користуватися без переписування всього бою.

## 0.0.21 — Effective Stats Helper, No Public Buffs Yet

**User-facing impact:**  
З’являється центральний helper для effective stats, але `/hero` і чинні нагороди ще не отримують прихованих бафів, доки PR не скаже це явно.

**Files likely to change:**  
`src/services/heroService.ts`, `src/services/equipmentService.ts`, `src/services/fightService.ts`, `src/bot/presenters/heroPresenter.ts`, `src/domain/characters/*`, `tests/services/*.test.ts`.

**Tests required:**  
- helper tests для effective base stats;
- regression tests, що `/hero` лишається unchanged unless opted in;
- fight math tests;
- reward tests;
- cooldown tests.

**Explicit non-goals:**  
- public stat buffs у hero sheet;
- persistent combat rework;
- нові item effects;
- schema changes для instance-level equipment.

**Risk notes:**  
Helper не повинен жити в presenter-і. Якщо stat math заховається в UI, ми втратимо тестованість і почнемо дублювати логіку по трьох місцях.

## Later slices

- tiny equipment effects v0: тільки дуже малі, simulation-tested бонуси;
- persistent combat: HP/mana state і коректне відновлення;
- group hunt hooks: спільна сцена, але без MMO-бою;
- reward economy tuning після перших playtests;
- eventual loot engine, якщо попередні slices не розвалили темп.

## One-line guardrail

Не стрибайте напряму в повний combat або full stat effects. Кожен наступний PR має бути маленьким і повертати гравцеві щось зрозуміле вже в цьому спліті.
