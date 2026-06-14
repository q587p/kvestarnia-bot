# Next Implementation Backlog після `0.0.19`

Нижче — канонічний порядок маленьких PR для добивання Phase 1. Кожен slice має бути перевірюваним окремо; якщо PR роздувається, різати.

## Phase 1 Scope Guard

Бестіарій лишається content/data foundation: read-only `/bestiary`, monster content, loot notes, flavor routing і Hunt Board contract source.

Не розширювати бестіарій як окрему фічу, collection loop, share card або journal progression, доки не закритий основний RPG-ланцюжок:

```text
combat domain → persistent fight → equipment stats → loot engine → level 1-10 → balance/playtest polish
```

## 0.0.20 — Combat Domain Engine

**Status**
Implemented in `0.0.20` as pure domain code. Runtime `/fight` still uses the old probe until `0.0.21`.

**Objective**
Реалізувати чистий domain combat engine без Telegram/grammY.

**Scope**

- combat state: player HP/mana, monster HP, turn, status `active/won/lost/fled/expired`;
- actions: `attack`, `skill`, `flee`;
- deterministic resolver: один player action + monster response змінює state;
- formulas MVP: physical/spell/trick damage, armor/resist, mana cost, flee result;
- unarmed/basic fallback: engine не має припускати, що герой уже має starter weapon;
- injected або deterministic RNG у тестах.

**Non-goals**

- no Telegram handlers;
- no Prisma migration;
- no loot grants;
- no mandatory starter weapon ownership;
- no equipment stat effects;
- no group combat.

**Acceptance criteria**

- domain не імпортує Telegram/grammY;
- tests cover win, loss, flee, mana too low, deterministic turn resolution;
- tests cover weaponless/basic attack path;
- звичайний бій має sanity band для 2-5 ходів.

## 0.0.21 — Persistent Fight Sessions

**Objective**
Підʼєднати combat engine до `/fight` як справжню persistent session.

**Scope**

- combat persistence model або узгоджений equivalent;
- service створює або відновлює active combat;
- callback-и короткі, v1, ownership/turn validated, stale-safe;
- fight screen показує HP/mana героя, HP ворога, доступні дії, результат останнього ходу;
- pending Barrel raid guard лишається сильнішим за fight callbacks.

**Non-goals**

- no random loot tables;
- no equipment effects;
- no full bestiary target selection;
- no group/PvP combat.

**Acceptance criteria**

- `/fight` starts/resumes one active solo combat;
- repeated callback того самого ходу не проводить ще один хід;
- stale callback не дублює damage/rewards.

## 0.0.22 — Equipment Stat Effects

**Objective**
Екіпіровані манатки починають давати маленькі прозорі bonuses, а combat і `/hero` читають ту саму effective stats математику.

**Scope**

- optional item effects, наприклад stat bonus, HP/mana max, armor, weapon damage, spell power;
- optional usable item metadata for later explicit use actions: healing, mana restore, temporary buff, combat option unlock, or dialogue option unlock;
- one effective-stats helper for base + level + equipment;
- `/hero`, `/equipment`, item detail показують внесок предметів;
- combat session reads effective values.

**Non-goals**

- no selling/trading/item instance refactor;
- no crafting;
- no requiredLevel bypass/respec tricks;
- no broad consumable economy or automatic item spending;
- no big offensive scaling.

**Acceptance criteria**

- equip/unequip змінює numbers у hero/equipment і combat tests;
- usable-item candidates are documented and safe, but any actual spend/use action requires explicit confirmation and idempotent callback design;
- junk/cosmetic/priceless items не дають power випадково;
- presenter не рахує приховану математику.

## 0.0.23 — Loot Engine + Reward Replay

**Objective**
Перетворити monster loot mapping на контрольований, тестований loot engine.

**Scope**

- `src/domain/loot/*` із rarity table;
- LUCK дає малий bounded modifier;
- loot candidates беруться з monsterLoot/item content;
- deterministic або injected RNG;
- reward claim transactional/idempotent;
- repeat/retry callback може показати stored reward details.

**Non-goals**

- no shops;
- no selling/trading;
- no crafting;
- no item-to-level sink;
- no bestiary collection expansion.

**Acceptance criteria**

- tests cover rarity distribution sanity, bounded LUCK, duplicate claim, no eligible item fallback;
- повторний callback не reroll-ить loot;
- reward UI безпечно показує exact items.

## 0.0.24 — Fight Rewards and Level 1-10

**Objective**
Закрити solo loop: real fight → reward → loot → level-up → hero/equipment impact.

**Scope**

- fight victory calls reward/loot/progression path;
- level thresholds 1-10 in one module;
- multi-level grant;
- level cap / alpha max behavior;
- level affects combat math through effective stats;
- short Ukrainian level-up copy with concrete changes.

**Proposed total XP thresholds**

```text
1: 0
2: 10
3: 25
4: 45
5: 70
6: 110
7: 160
8: 225
9: 305
10: 400
```

**Acceptance criteria**

- tests cover threshold crossing, multiple levels, cap at 10, duplicate reward no duplicate level;
- `/hero` and combat agree on level/effective values.

## 0.0.25 — Phase 1 Balance and Playtest Polish

**Objective**
Не додавати фічі, а довести Phase 1 до done.

**Scope**

- `npm run check` green;
- combat simulations або lightweight balance matrix;
- `docs/PLAYTESTING.md` real smoke test;
- roadmap/GDD/balance docs match code;
- changelog/news for runtime release.

**Acceptance criteria**

- новий гравець проходить Phase 1 loop за кілька хвилин;
- звичайний бій триває приблизно 2-5 ходів;
- win rate не виглядає каральним;
- loss/flee не забирають цінний лут.

## Later / Не Phase 1 Finish

- group hunts/raids;
- social player interactions: виклик на дуель у корчемний бійцівський куток, пропозиція всліпу помінятися манатками, маленька інтерактивна міні-гра між гравцями;
- player influence on hunts: допомогти іншому гравцю закрити полювання або, якщо дуже хочеться бути проблемою, допомогти монстру в межах безпечних anti-abuse rules;
- activity presence: зберігати й показувати coarse тип поточної дії персонажа, наприклад «чекає бочку», «спілкується з єгерем», «бʼється з монстром», «отримує нагороду»;
- trading/gifting;
- shops/selling;
- crafting/enchant/reroll;
- Redis/BullMQ/jobs, якщо SQLite transactions достатні;
- Mini App inventory/profile;
- more bestiary content or collection UI.
