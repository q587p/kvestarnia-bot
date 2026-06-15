# Next Implementation Backlog після `0.0.23`

Нижче — канонічний порядок маленьких PR для добивання Phase 1. Кожен slice має бути перевірюваним окремо; якщо PR роздувається, різати.

## Phase 1 Scope Guard

Бестіарій лишається content/data foundation: read-only `/bestiary`, monster content, loot notes, flavor routing і Hunt Board contract source.

Не розширювати бестіарій як окрему фічу, collection loop, share card або journal progression, доки не закритий основний RPG-ланцюжок:

```text
combat domain → persistent fight → equipment stats → loot engine → level 1-13 tuning → achievements phase 1 → balance/playtest polish
```

## 0.0.20 — Combat Domain Engine

**Status**
Implemented in `0.0.20` as pure domain code. Runtime `/fight` wiring landed in `0.0.21`.

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

**Status**
Implemented in `0.0.21` as the first Telegram runtime wiring for the combat domain engine. Persistent fights initially shipped without per-fight rewards in this slice, but include one tiny wrapper quest, `Тринадцять дрібних проблем`, with a fixed one-time completion reward after 13 won sessions. `0.0.23` later adds the first small per-session reward/loot path.

**Objective**
Підʼєднати combat engine до `/fight` як справжню persistent solo session.

**Scope**

- `solo_combat_sessions` stores serializable `CombatState`, monster id, status, and lazy expiry;
- service створює або відновлює one active combat for level 3+ characters;
- callback-и короткі, v1, ownership/turn validated, stale-safe;
- fight screen показує HP/mana героя, HP ворога, доступні дії, результат останнього ходу;
- pending Barrel raid guard лишається сильнішим за fight callbacks;
- quest hub and fight screens show `Тринадцять дрібних проблем` progress from won solo sessions;
- completion reward is claimed once through `daily_actions` bucket `once`;
- starter fight probe for levels 1-2 stays intact.

**Non-goals**

- no per-fight rewards, XP, gold, or item grants in the original `0.0.21` slice; this gap is later addressed by `0.0.23`;
- no random loot tables;
- no equipment effects;
- no group/PvP combat;
- no background workers.

**Acceptance criteria**

- `/fight` starts/resumes one active solo combat;
- repeated callback того самого ходу не проводить ще один хід;
- stale callback не дублює damage/rewards;
- terminal states are stable and do not reopen automatically.

## Later — Achievements Phase 1

**Objective**
Додати першу систему ачівок як колекцію жартівливих титулів без gameplay-бонусів.

**Source**

- `docs/ACHIEVEMENTS_PHASE1.md`;
- локальний planning archive `kvestarnia-achievements-phase1.zip` має seed на 54 definition records і issue-ready tasks.

**Scope**

- definitions seed із 54 ачівками;
- storage для earned achievements і progress snapshots;
- idempotent `AchievementService.track(event)`;
- кнопка `🏅 Ачівки` з екрану персонажа;
- категорії, пагінація по 10 рядків, earned/locked/hidden states;
- grouped unlock notifications;
- silent або summarized backfill для старих гравців;
- callback data <=64 bytes.

**Non-goals**

- no combat runtime wiring beyond safe event hooks;
- no XP, gold, item, stat, or power rewards;
- no active-title selection unless it is clearly tiny and safe;
- no bestiary collection expansion;
- no shop/economy implementation just to satisfy future achievement definitions;
- no production dependencies.

**Acceptance criteria**

- seed validation/idempotency tests pass;
- hidden achievements do not reveal criteria before unlock;
- duplicate events do not duplicate earned rows or notifications;
- UI shows `Отримано: X/54`, categories, pages, and dates;
- backfill does not spam old players.

## 0.0.22 — Equipment Stat Effects

Status: implemented in `0.0.22`.

**Objective**
Екіпіровані манатки починають давати маленькі прозорі bonuses, а combat і `/hero` читають ту саму effective stats математику.

**Scope**

- optional item effects, наприклад stat bonus, HP/mana max, armor, weapon damage, spell power;
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

Follow-up debt: usable item metadata and actual item-use actions remain future work with explicit confirmation and idempotent callback design.

## 0.0.23 — Loot Engine + Reward Replay

**Objective**
Перетворити monster loot mapping на контрольований, тестований loot engine.

**Status**
Implemented in `0.0.23` for won persistent solo fights.

**Scope**

- `src/domain/loot/*` із rarity table;
- LUCK дає малий bounded modifier;
- loot candidates беруться з monsterLoot/item content;
- deterministic або injected RNG;
- reward claim transactional/idempotent;
- repeat/retry callback може показати stored reward details.
- won persistent fight claims a small XP/gold/item reward once per session.

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

## 0.0.24 — Level Cap 13

**Status**
Implemented in `0.0.24`.

**Scope**

- current alpha cap raised from level 10 to level 13;
- total XP thresholds extended with `520`, `660`, `825`;
- level-cap celebration and `/restart` suggestion moved to level 13;
- epic-level planning bracket moved to levels `14-23`.

## 0.0.25 — Fight Rewards and Level 1-13

**Objective**
Довести solo loop після першого reward/loot path: real fight → reward → loot → level-up → hero/equipment impact має мати нормальний темп 1-13 і зрозумілий playtest checklist.

**Scope**

- tune current fight reward/loot/progression path;
- level thresholds 1-13 in one module;
- multi-level grant;
- level cap / alpha max behavior;
- level affects combat math through effective stats;
- future-safe monster level modifiers: манатки або дії інших гравців можуть тимчасово знижувати чи піднімати effective рівень монстра; нижчий рівень має давати менші/гірші rewards, вищий — кращі rewards, але різко складніший бій і більшу потребу в разових манатках;
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
11: 520
12: 660
13: 825
```

**Acceptance criteria**

- tests cover threshold crossing, multiple levels, cap at 13, duplicate reward no duplicate level;
- `/hero` and combat agree on level/effective values.

## 0.0.26 — Phase 1 Balance and Playtest Polish

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
