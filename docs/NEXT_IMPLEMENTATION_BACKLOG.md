# Next Implementation Backlog після `0.0.25`

Нижче — канонічний порядок маленьких PR для добивання Phase 1. Кожен slice має бути перевірюваним окремо; якщо PR роздувається, різати.

## Phase 1 Scope Guard

Бестіарій лишається content/data foundation: read-only `/bestiary`, monster content, loot notes, flavor routing і Hunt Board contract source.

Не розширювати бестіарій як окрему фічу, collection loop, share card або journal progression, доки не закритий основний RPG-ланцюжок:

```text
persistent fight → equipment stats → loot/reward replay → level 1-13 + HP/mana persistence → recovery/balance polish → inventory/chest polish → balance/playtest polish
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

## 0.0.24 — Level Cap 13 & Grownup Cellar Quest

**Status**
Implemented in `0.0.24`.

**Scope**

- current alpha cap raised from level 10 to level 13;
- total XP thresholds extended with a steeper post-level-9 climb: `450`, `650`, `900`, `1300`;
- level-cap celebration and `/restart` suggestion moved to level 13;
- epic-level planning bracket moved to levels `14-23`;
- persistent solo fights prefer monsters closer to the hero level and fall back to the highest eligible lower-level monster when content has no same-band enemy yet;
- XP from persistent solo fights is capped to `1` when the monster is more than 2 levels below the hero;
- level 4+ `/cellar` route opens `Справа не до миші` instead of the retired mouse dead-end;
- seal purchase, roleplay bypass, bottle grant, and final choice are idempotent through existing `daily_actions` / cooldown / item rows;
- no broad quest engine or new schema was added.

## 0.0.25 — Persistent HP/Mana & Loot Expansion

**Status**
Implemented in PR #39.

**Scope**

- persisted HP/mana attrition for level 3+ persistent solo fights;
- lazy out-of-combat HP/mana regeneration with class/race/title/stat modifiers;
- guarded passive regen writes so stale read paths do not overwrite fresher combat/equipment resource rows;
- Loot Expansion v1 as a wide content-backed persistent-fight loot pool;
- handcrafted loot coverage for the ordinary level 4-13 monster ladder;
- Hunt Board scaling against the level 4-13 monster ladder;
- direct item-detail links from Mantok Chest output and the kept grownup cellar bottle result;
- public-site/news/docs cleanup for the player-facing release surface.

**Non-goals**

- no manual Mantok Chest input selection;
- no potions, temple healing, paid healing, combat-time regeneration, shops, trading, crafting, item-instance inventory, full loot effect processors, or full Hunt Board combat loop.

## 0.0.26 — Phase 1 Recovery & Balance Polish

**Status**
Current stabilization slice after `0.0.25`. This is the small pass that keeps HP/mana attrition, passive recovery, loot expansion, Hunt Board scaling, and persistent fight rewards coherent before the next feature slice.

**Objective**
Підрівняти відчуття після `0.0.25`: hero recovery має бути зрозумілим, same-level fights — не ламатися на верхніх рівнях, а локальний smoke path — легко повторюваним.

**Scope**

- passive recovery clarity in `/hero`, fight rest states, and quest hub hints;
- small monster-derivation tuning only where smoke tests show obvious outliers;
- docs/checklist updates for the 3, 4, 8, 13 smoke band;
- no new systems or economy branches.

**Non-goals**

- no potion/healing economy;
- no manual chest selection;
- no new loot families;
- no combat formula rewrites beyond a small monster-side tune;
- no schema changes.

**Acceptance criteria**

- zero-HP reads tell the player to rest first;
- same-level ordinary fights stay in the target feel band after smoke checks;
- `npm run simulate:combat`, `npm run sample:loot`, and `npm run check` are documented in the playtesting notes.

## 0.0.27 — Manual Mantok Chest Selection & Inventory Polish

**Objective**
Доробити Дружню Скриню після runtime MVP: ручний вибір манаток, краща інвентарна ергономіка й підготовка до item-instance identity без магазинів, продажу або trading.

**Status**
Planned after `0.0.26`, because runtime auto-pick chest exists, but manual selection and deeper inventory polish are still deferred.

**Scope**

- manual selection with pagination and `x/5` counter;
- clearer item grouping/filtering around recyclable vs protected/equipped/priceless stacks;
- keep transaction/idempotency safety from the `0.0.24` auto-pick path;
- document or design item-instance identity if stack-level protection becomes too restrictive;
- docs source: `docs/MANTOK_CHEST_BACKLOG.md`.

**Non-goals**

- no shops;
- no selling/trading;
- no crafting tree;
- no item-to-level exchange;
- no social recycling;
- no new combat rewards.

**Acceptance criteria**

- tests cover manual selection, callback size, stale selections and duplicate callbacks;
- selected items never disappear unless 1 valid output item is created;
- player-facing copy stays clear that input манатки are gone forever after confirmation.

## 0.0.28 — Phase 1 Balance and Playtest Polish

**Objective**
Не додавати фічі, а довести Phase 1 до done: real fight → reward → loot → level-up → hero/equipment/resources impact має мати нормальний темп 1-13 і зрозумілий playtest checklist.

**Scope**

- tune current fight reward/loot/progression path;
- verify level thresholds 1-13, multi-level grant, cap behavior, and weak-target XP together;
- verify level/equipment/resource persistence affects combat math through shared effective stats without hidden refills;
- after `0.0.26`, resource-management follow-up should add explicit healing/rest/item actions only through confirmed, idempotent flows; no hidden full auto-restore before every fight;
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
10: 450
11: 650
12: 900
13: 1300
```

**Acceptance criteria**

- tests cover threshold crossing, multiple levels, cap at 13, duplicate reward no duplicate level;
- `/hero` and combat agree on level/effective values.

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
