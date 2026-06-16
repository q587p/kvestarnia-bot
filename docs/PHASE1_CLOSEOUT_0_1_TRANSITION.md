# Phase 1 Closeout — 0.0.x → 0.1.x

Дата джерельного пакета: `12026-06-15`.

Цей документ фіксує межу між лінійкою `0.0.x` і першою milestone-лінійкою `0.1.x`. Він не додає нових систем і не є runtime scope. Його задача — не дати Phase 1 розтягнутися ще на кілька «майже останніх» фіч.

## Коротке рішення

`0.0.x` — це будівельна лінійка Phase 1: створення пригодника, корчма, перші квести, persistent solo-бій, HP/мана, манатки, спорядження, контрольована здобич, рівні 1-13, Дружня Скриня, Єгерська справа і базова присутність.

`0.1.0 — Phase 1 Closeout & Phase 2 Roadmap` є closure/release PR: версійна поверхня, release notes, docs freeze, smoke checklist, чіткий backlog на `0.1.x` і reset Phase 2 у напрямі Social Combat & Interactions. Без нових gameplay-систем, крім мінімальних blocker-fix змін.

`0.1.x` — це стабілізація і малі свідомі розширення після playtest-у, а не продовження «ще трошки Phase 1».

Phase 1 закривається цим `0.1.0` PR після:

1. завершення `0.0.30 — Level Barter Safety & Closeout Alignment`, бо `0.0.29` уже вмержив ширший runtime: Єгерський слід плюс Манчкін-скупник;
2. повного smoke core-loop;
3. closure PR до `0.1.0` без нових gameplay-систем;
4. створення або оновлення канонічного `0.1.x` backlog issue/doc.

## `0.1.0` closure scope

### 1. Baseline

`0.0.30` уже вмержено як baseline для closeout. Міграція `level_barter_exchanges` лишається вузьким audit/idempotency boundary для Манчкін-скупника, а не стартом нової економіки.

### 2. Пройти core smoke

Мінімальні поверхні:

- onboarding;
- `/hero`;
- корчма і presence;
- solo persistent fight;
- HP/mana recovery;
- inventory/equipment;
- Дружня Скриня auto/manual;
- Єгерська справа після `0.0.29`;
- Манчкін-скупник після `0.0.30`: replay confirm, no gold-only, protected/equipped exclusions, pending Barrel guard;
- `/version`, `/news`, `/health`, public site і public presence.

Детальний smoke живе в [docs/PHASE1_CLOSEOUT_SMOKE.md](PHASE1_CLOSEOUT_SMOKE.md).

### 3. Closure PR `0.1.0`

Scope closure PR:

- `package.json` / lockfile до `0.1.0`;
- `CHANGELOG.md` з коротким підсумком Phase 1;
- `news.md` з player-facing новиною без внутрішньої кухні й без спойлерів;
- `README.md` з актуальним playable loop;
- `docs/PHASE1_RELEASE_NOTES.md`;
- `docs/ROADMAP.md`, де Phase 1 позначено закритою, `0.1.x` — стабілізаційною лінійкою, а Phase 2 — Social Combat & Interactions;
- `docs/NEXT_IMPLEMENTATION_BACKLOG.md` з top-order для `0.1.x`;
- `docs/README.md` і `docs/phase2/*` як новий planning index для duel invites, trading/gifting, `/remort`, item tags, multi-enemy and party combat;
- `docs/PLAYTESTING.md` або окремий smoke doc із closure route;
- `docs/BALANCE_NOTES.md` із відомими не-фінальними балансними припущеннями.

Non-goals closure PR:

- Achievements runtime;
- нові формули бою;
- нові локації;
- durable outbox/jobs;
- продаж, торги, shops, crafting;
- item-instance inventory;
- group raids, guilds, PvP, Mini App.

### 4. Зафіксувати `0.1.x` backlog

Після closure PR має існувати один канонічний backlog issue/doc. Усе, що спокушає «доробити перед першою стабілізацією», але не блокує core loop, має переїхати туди.

## Release gate

- Ручний smoke у Telegram на чистому персонажі.
- Ручний smoke у Telegram на персонажі 4+.
- Перевірка public `/news` і `/presence`.
- Перевірка, що `news.md` не містить implementation details, internal ids, exact reward spoilers або release-engine debt.

## Optional docs-only follow-up

Тільки якщо зміна дуже мала і не роздуває stabilization:

- cleanup/reuse для старих pending `mantok_chest_runs`;
- невеликий docs-only archive note;
- issue drafts для deferred tasks.

Якщо задача потребує міграції, нової таблиці, нової економіки, нової локаційної моделі або широких callbacks, вона вже не closeout.

## Не Тягнути В Phase 1

- Achievements runtime.
- Продаж манаток задля пива в Шинку.
- Bestiary browse filters за рівнями й типами.
- Глибка як dungeon routing.
- Durable Barrel Raid Notifications, якщо це не тривіальний patch.
- Yeger bait/lure/ambush/reputation.
- Shops, selling, trading, crafting.
- Item-instance inventory.
- Group raids, guilds, PvP, Mini App.
- Broad combat rewrite.
- Lore bible expansion.

## План Дій Після `0.1.0`

### День 1 — release gate

Ціль: переконатися, що `0.1.0` справді закриває Phase 1 без нового runtime scope.

Порядок:

1. Прочитати diff.
2. Перевірити відсутність небажаного scope creep.
3. Прогнати `npm.cmd run db:validate`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd test`, `npm.cmd run check`, `git diff --check`.
4. Якщо `check` падає на Windows Prisma `EPERM`, зупинити локальний bot/dev process і повторити.
5. Перевірити Єгерський smoke: lock до 4 рівня, start idempotent, tracking pending, ready trail, active non-Yeger fight не маскується під неупокоєну ціль і не спалює ready trail, 5/5 turn-in idempotent.
6. Перевірити Манчкінський smoke: повторний confirm replay-ить успіх, gold-only відхилено, pending Бочка блокує старі кнопки.
7. Merge або один targeted blocker-fix commit, якщо smoke знайшов blocker.

### День 2 — first stabilization

Ціль: почати `0.1.x` з реального playtest fallout, а не з великої нової системи.

Перший follow-up має бути `0.1.1`: bugfixes, copy polish, small UX papercuts and smoke fallout. Якщо під час роботи хочеться додати «маленьку» фічу, її треба перенести в deferred backlog.

### День 3 — deploy verification і backlog

Після merge/deploy `0.1.0`:

1. перевірити `/version`;
2. перевірити `/health`;
3. перевірити `/news`;
4. пройти короткий Telegram smoke;
5. створити або оновити `0.1.x` backlog issue/doc.

## 0.1.x Перший Порядок

Рекомендована послідовність після `0.1.0`:

1. `0.1.1` — тільки bugfixes from playtest.
2. `0.1.2` — durable Barrel outbox або Mantok Chest pending cleanup, залежно від реального болю.
3. `0.1.3` — Глибка dungeon routing, якщо playtest показує, що бій біля Столу зі справами ламає уявлення.
4. Перший Phase 2 slice — duel invite MVP, якщо core loop стабільний.
5. Далі — result/rematch/tournament cards, trading/gifting, combat variety, `/remort`, multi-enemy combat, party combat / real raids.

Кожен `0.1.x` PR має відповідати на питання: це стабілізує вже наявну гру чи відкриває новий feature track? Якщо друге — краще відкласти.

## Deferred To 0.1.x

### Durable Barrel Raid Notifications

Причина зробити: process-local completion notifications можуть губитися після restart/deploy.

Чому не blocker Phase 1: durable outbox/job semantics легко перетворюються на архітектурний PR.

### Mantok Chest pending cleanup/reuse

Причина зробити: pending manual/preview runs можуть накопичуватися.

Чому не blocker Phase 1: для MVP це прийнятий борг; confirm лишається idempotent і не дублює reward.

### Глибка Dungeon Location

Причина зробити: перенести бойову присутність зі Столу зі справами в окрему пригодову місцину.

Чому не blocker Phase 1: routing/presence touchpoints можуть зачепити старі callbacks.

### Achievements Phase 1

Причина зробити: rewardless progress/titles добре працюють на retention і тон.

Чому не blocker Phase 1: це не потрібно для solo combat/equipment/loot loop, а runtime/backfill може роздутися.

### Шинок: Манатки За Пиво

Причина зробити: excess priced манатки можуть палитися на корчемну щедрість без перетворення на вільне золото.

Чому не blocker Phase 1: це item-spending economy з confirmation, exclusions і ledger semantics.

### Bestiary Browse Filters

Причина зробити: 30+ монстрів уже просять browse за рівнями й типами.

Чому не blocker Phase 1: це read-only, але все одно окремий UX feature track.

### Yeger bait/lure/ambush/reputation

Причина зробити: природне розширення після tracking search.

Чому не blocker Phase 1: спершу треба подивитися, як працює перший Єгерський loop.

## Hard Defer Beyond 0.1.x Stabilization

- Shops/selling/trading/crafting.
- Item-instance inventory.
- Guilds, large raids, markets and broad PvP modes beyond opt-in duel MVP.
- Mini App.
- Broad combat rewrite.
- Lore bible expansion.
