# Bestiary Collection Backlog

> Status after `0.0.19`: parked until Phase 1 finish. Не брати ці задачі як наступний gameplay PR, доки не закриті combat engine, equipment stat effects, loot engine і level 1-13. Бестіарій лишається content/data foundation для combat/loot, не окремим collection feature track.

Нижче — пріоритетний backlog для bestiary collection / hunt journal slices.

## 1. Docs-only review of #26 ledger after merge

**Goal**  
Перевірити, як Hunt Contract Ledger після merge впливає на collection projection і чи не створює другий reward source.

**Files likely touched**

- docs only: `docs/design/bestiary-collection-design.md`, `docs/backlog/hunt-journal-progress-plan.md`, `docs/architecture/bestiary-collection-data-model-notes.md`
- maybe future cross-reference docs

**Acceptance criteria**

- описано, де живе source of truth;
- зафіксовано, які projection rows потрібні;
- немає дублювання reward logic.

**Explicit non-goals**

- no runtime code;
- no schema change;
- no reward replay implementation.

**Risk notes**

- якщо ledger і journal описані різними словами, наступний PR може роз’їхатись семантично.

## 2. Bestiary collection schema shell

**Goal**  
Додати мінімальний schema shell для collection/projection rows без повної UI.

**Files likely touched**

- `prisma/schema.prisma`
- maybe one migration
- future collection repository/service
- tests for uniqueness and cleanup

**Acceptance criteria**

- є таблиця або projection shell;
- вона не стає другою reward source;
- reset/delete поведінка визначена.

**Explicit non-goals**

- no public `/bestiary` UI;
- no cosmetic titles;
- no power bonuses.

**Risk notes**

- schema overdesign тут особливо небезпечний: collection має лишитися projection, а не окремою грою.

## 3. Hunt Journal read model

**Goal**  
Показати персонажу останні contracts, actions і reward replay summary.

**Files likely touched**

- hunt journal service/repository
- bot presenter
- callback parser for journal navigation
- tests for read model and replay rendering

**Acceptance criteria**

- показується recent history;
- repeated action shows original reward summary;
- no flat “already done” dead-end.

**Explicit non-goals**

- no reward generation;
- no new combat;
- no collection power bonuses.

**Risk notes**

- journal може випадково стати просто журналом логів. UI має залишитися пригодницьким, а не адміністративним.

## 4. Reward replay UI polish

**Goal**  
Показувати «вже зараховано» як корисний replay із підсумком, а не як суху помилку.

**Files likely touched**

- hunt result presenter
- ledger state view
- tests for stale callback display

**Acceptance criteria**

- repeated callback віддає той самий підсумок;
- видно original reward summary;
- текст лишається коротким.

**Explicit non-goals**

- no reroll;
- no second reward source;
- no extra schema beyond what ledger needs.

**Risk notes**

- якщо replay копіює UI-повідомлення без стану, наступний PR втратить історію.

## 5. First encounter / studied markers

**Goal**  
Додати стани `seen`, `encountered`, `resolved`, `trophySeen`, `studied` у bestiary detail.

**Files likely touched**

- bestiary read model
- content-state projection service
- presenter / UI labels
- tests for state transitions

**Acceptance criteria**

- кожен стан має окремий, зрозумілий текст;
- locked/seen/resolved/studied різняться;
- немає FOMO-формулювань.

**Explicit non-goals**

- no guaranteed drops;
- no stats bonuses;
- no public sharing.

**Risk notes**

- стани мають бути охайно названы й не перекривати одне одного.

## 6. Monster detail polish using collection state

**Goal**
Зробити картку монстра живішою: notes, first encounter, trophy memory, studied flavor.

**Files likely touched**

- monster detail presenter
- bestiary collection read model
- flavor selection helpers
- tests for copy and privacy

**Acceptance criteria**

- detail screen змінюється залежно від прогресу;
- не показуються чутливі або зайві технічні дані;
- copy лишається українським і коротким.

**Explicit non-goals**

- no power effects;
- no economy changes;
- no external sharing by default.

**Risk notes**

- detail screen може почати виглядати як encyclopedia wall. Треба лишити її Telegram-friendly.

## 6a. Complete monster notes and trophy mapping

**Goal**
Доробити базовий Бестіарій до повного coverage: кожен активний монстр має коротку нотатку, можливі трофеї, і runtime loot chances реально привʼязані до відповідних monster ids або явних shared loot profiles.

**Files likely touched**

- `src/content/monsters.ts`
- `src/content/monsterLoot.ts` / current monster loot routing source
- bestiary presenter/content validation
- loot engine tests and bestiary content tests

**Acceptance criteria**

- every active monster has a bestiary note;
- every active monster has a player-facing possible-trophy hint, unless explicitly marked as no-trophy and justified;
- every displayed trophy hint maps to an actual item/drop path for that monster;
- concrete trophy chances are testable in runtime loot tables but exact odds are not shown in pre-commit/player-facing Bestiary copy;
- tests fail on missing notes, missing trophy hints, orphan item ids, and trophy hints that cannot drop.

**Explicit non-goals**

- no guaranteed drops;
- no collection tracking in this slice;
- no XP/gold rebalance just because trophy tables are being aligned;
- no new monster roster expansion unless a separate content task asks for it.

**Risk notes**

- Бестіарій не має обіцяти трофей, якого loot engine не може дати. Якщо trophy hint і drop table розʼїдуться, гравець побачить фольклор, а отримає бухгалтерію з діркою.

## 7. Weekly field-note digest

**Goal**  
Додати тижневий digest про нові види монстрів, не перетворюючи його на маркетингову розсилку.

**Files likely touched**

- digest formatter
- scheduler/job only if already justified later
- journal view
- tests for summary selection

**Acceptance criteria**

- є короткий тижневий summary;
- він не спамить;
- показує лише те, що вже реально сталося.

**Explicit non-goals**

- no Redis jobs just for docs;
- no social feed;
- no leaderboard pressure.

**Risk notes**

- digest має бути optional. Якщо його почати нав’язувати, колекція стане відволіканою.

## 8. Optional public/shareable collection card

**Goal**  
Дати opt-in share card для bestiary progress або hunt journal highlights.

**Files likely touched**

- share-card presenter
- privacy settings
- tests for redaction

**Acceptance criteria**

- opt-in only;
- no exact public timestamps;
- no full activity feed;
- card можна поділити без приватних деталей.

**Explicit non-goals**

- no default public profile;
- no doxxing risk;
- no competitive pressure.

**Risk notes**

- якщо share card зробити занадто інформативною, це стане публічним телеметричним листом, а не веселою карткою.

## 9. Collection cleanup on character reset

**Goal**  
Переконатися, що bestiary/progress projection чисто видаляється або каскадиться при reset персонажа.

**Files likely touched**

- repositories / cleanup service
- tests for deletion and cascade

**Acceptance criteria**

- journal rows не висять orphaned;
- trophies/notes зникають разом із персонажем;
- reset не ламає можливість створити нового героя.

**Explicit non-goals**

- no cross-character migration;
- no public archival by default.

**Risk notes**

- якщо cleanup запізнюється, старий прогрес може привидом спливати в новому акаунті.

## 10. Collection safety tests

**Goal**  
Покрити projection/state logic тестами, щоб collection не ламала reward flow.

**Files likely touched**

- tests for read model / projection / presenter

**Acceptance criteria**

- повторний callback не створює новий reward;
- collection state updates are idempotent;
- reward source of truth лишається одна.

**Explicit non-goals**

- no gameplay changes;
- no schema change by itself.

**Risk notes**

- це той випадок, де тестів ніколи не буває забагато.
