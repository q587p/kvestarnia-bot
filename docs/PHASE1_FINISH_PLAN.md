# Phase 1 Finish Plan

Цей документ фіксує scope lock після `0.0.19`: добиваємо основний solo RPG loop, а не розширюємо нові поверхні.

## Головна ціль

Новий гравець має за кілька хвилин пройти зрозумілу RPG-петлю:

```text
/start → герой → справжній бій → XP/золото/лут → inventory/equipment → рівень і цифри реально впливають на наступний бій
```

Бестіарій, Hunt Board, presence, корчма й flavor уже дали корисну інфраструктуру. Але Phase 1 не закрита, доки немає справжнього combat → equipment stats → loot → level 1-10 loop.

## Scope Lock

До завершення Phase 1 не розширювати як окремі feature tracks:

- бестіарій collection/progression UI;
- нові bestiary share cards, digest-и або journal surfaces;
- group hunts/raids;
- guilds, PvP, market, trade, crafting, Mini App;
- Redis/BullMQ/jobs, якщо конкретний PR не доводить, що без цього неможлива ідемпотентність.

Бестіарій лишається data/content foundation: read-only `/bestiary`, monster roster, monster → loot notes, flavor routing і source для майбутнього combat/loot. Нові bestiary-зміни допустимі тільки якщо вони прямо обслуговують combat/loot або виправляють безпеку/неточність наявного read-only surface.

## Послідовність PR

1. **Scope lock docs**
   Docs-only. Зафіксувати цей порядок у roadmap/workflow/playtesting без bump version, changelog або news.

2. **Combat Domain Engine**
   Чистий TypeScript domain combat без Telegram: state/action/result, HP/mana, monster HP, turn, status, deterministic resolver, win/loss/flee/mana tests.

3. **Persistent `/fight` Sessions**
   Підʼєднати combat engine до runtime: combat row/session, start/resume, short validated callbacks, stale-safe turns, pending Barrel raid guard.

4. **Effective Stats + Equipment Effects**
   Один helper для base stats + level + equipment. Манатки дають маленькі прозорі bonuses, `/hero` і combat читають ту саму математику.

5. **Loot Engine + Reward Replay**
   Контрольовані loot tables із rarity, bounded LUCK modifier, deterministic/injected RNG, idempotent reward claim і replay деталей.

6. **Integrated Fight Rewards + Level 1-10**
   Fight victory видає XP/gold/item через новий path. Level thresholds 1-10 живуть в одному модулі, multi-level grant і cap behavior протестовані.

7. **Phase 1 Balance / Playtest / Polish**
   Не додавати фічі. Пройти smoke checklist, симуляції або balance matrix, оновити docs/release surfaces.

## Пропонована XP-крива для альфи 1-10

Це робоча крива для видимого прогресу, не фінальний баланс:

| Рівень | Total XP |
|---:|---:|
| 1 | 0 |
| 2 | 10 |
| 3 | 25 |
| 4 | 45 |
| 5 | 70 |
| 6 | 110 |
| 7 | 160 |
| 8 | 225 |
| 9 | 305 |
| 10 | 400 |

## Phase 1 Done

Phase 1 можна вважати закритою, коли:

- `/fight` запускає справжню покрокову solo-сутичку на 2-5 ходів;
- у бою є attack, class/special action і flee;
- HP/mana змінюються в межах combat session і відображаються;
- stats, level і equipped items впливають на damage/survival/skill outcome через один helper;
- перемога видає XP/gold/item через loot engine;
- повторний callback не дублює XP/gold/items/level;
- level-up 1-10 має тести й видимий короткий текст;
- loss/flee не карають жорстко й не стають безкоштовним full reward;
- `npm run check` або еквівалентні lint/typecheck/build/test проходять;
- `docs/ROADMAP.md`, `docs/GAME_DESIGN.md`, `docs/BALANCE_NOTES.md`, `docs/PLAYTESTING.md`, `CHANGELOG.md`, `news.md` оновлені для runtime-релізів.
