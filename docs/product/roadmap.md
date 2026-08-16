# Roadmap

Цей документ описує поточну чергу продукту. Завершені релізи живуть у
[`CHANGELOG.md`](../../CHANGELOG.md), [`docs/tasks/README.md`](../tasks/README.md) і
[`docs/history/`](../history/); їх не треба повторювати тут довгим журналом.

## Продуктова вісь

Квестарня рухається від короткої сольної пригоди до Telegram-native соціяльної RPG:

1. одна зрозуміла дія й смішний результат;
2. персонаж, лут і довга прогресія;
3. безпечні дуелі, подарунки й присутність;
4. маленький гурт із спільною тактичною метою;
5. ґільдія як ідентичність і причина повернутися;
6. сезони, колекції та економіка лише після стабільного групового ядра.

Український голос, коротка сесія, fair free-to-play, приватність і replay-safe
мутації лишаються незмінними guardrails.

## Стан фаз

| Фаза | Стан | Доказ |
| --- | --- | --- |
| Foundation і solo loop | закрито | `0.0.x`–`0.1.0` |
| Social Combat & Interactions | закрито | `0.1.x`–`0.2.x` |
| Closed Alpha Readiness / Season Zero Foundation | закрито в репозиторії | `0.3.0`–`0.3.17` |
| Party Progression | активна | `0.4.4` merged; `0.4.5` guild foundation у PR #190; `0.4.6` наступна |
| Economy expansion / seasons | пізніше | після доказу retention груп і ґільдій |

Наявність коду не дорівнює production-доступности. Для feature-flagged систем
окремо фіксуються merge, migration, target environment, automated checks, ручна
Telegram QA та kill switch у
[`docs/operations/release-state-ledger.md`](../operations/release-state-ledger.md).

## 0.3.x — змерджений репозиторний baseline

Package `0.3.17` закрив цю лінійку: raid chat (`0.3.15`),
lifecycle/repair/race та release-evidence safeguards
(`0.3.16`), а потім callback read-path collapse (`0.3.17`).

Цей стан репозиторію не доводить production deployment, hosted flag values,
ручну Telegram QA чи observation window. Це окремі докази в
[release-state ledger](../operations/release-state-ledger.md).

## 0.4.x — Party Progression

### Архітектурний cutline

- Не перетворювати `PartyBossSession` на універсальну N×M модель: вона зберігає
  Big-Barrel-specific boss/taunt/ward/protocol semantics.
- Не додавати новий груповий workflow у великий `FightService`.
- Повторно використати `PartySession`, `ActiveCombatLease`, actor action atom,
  queue/CAS/timeout і canonical-card ідеї.
- Створити окремі `GroupCombatSession`, `GroupCombatParticipant` і
  `GroupCombatAction` із versioned strict state, target identity, repair і
  per-player settlement.
- Межа production runtime `0.4.2`: 1–3 пригодники проти 1–6 ворогів за
  незмінними reservation/party inputs. Більша ватага або понад шість ворогів —
  не прихована обіцянка.

Канонічний технічний план:
[`party-combat-evolution-plan.md`](../architecture/party-combat-evolution-plan.md).

### 0.4.0 — Party-vs-many proof

Feature-flagged/dev-only вертикальний доказ: наявний тимчасовий гурт, один
authored encounter 2–3×2–3, детерміновані раунди, leases, timeouts, restart-safe
state і canonical participant cards. Без XP, золота, манаток, квестового прогресу
чи production rollout.

Repository release `0.4.0` містить цей default-off proof і не відкриває
production-маршрут або винагороди. Наявність у репозиторії не доводить deploy,
production availability чи ручну Telegram QA; ці докази лишаються pending.

### 0.4.1 — Group combat hardening

Repository release `0.4.1` hardens the same hidden, rewardless 3×3-bounded
runtime: deterministic targeting, current class/race and supported gear/item
actions, multi-enemy threat/status handling, strict lifecycle repair,
immutable zero-reward settlement plans with independently replayable receipts,
and 2×2/3×3 simulator coverage through 13- and 25-turn scenarios.

The proof remains default-off and production-hard-disabled. Deployment,
production availability and manual Telegram QA on the final exact head remain
separate pending evidence.

### 0.4.2 — Left-passage party attack

Перший production-capable `GroupCombat`: точну hard-оказію лівого проходу
можна зарезервувати за `PartySession`, зібрати 1–3 current-life пригодників і
провести детерміновану сутичку проти 1–6 ворогів, масштабовану від замороженої
кількости й сили учасників. Незмінний склад, ресурси, припаси й здібності
ворогів, per-player settlement, детерміновані знахідки за кожного ворога,
bounded журнал і підсумки
внеску пригодників та монстрів переживають restart/retry. Збір видно через
`👀 Хто поруч`, а сольна кнопка лишається. Після перемоги всі учасники бачать
той самий детермінований 13–23-хвилинний чистий прохід і недоступний
`🪜 Ярус II`; до завершення цього часу інший збір лівого проходу не приймає
їх ані за запрошенням, ані через `👀 Хто поруч`. Сам перехід на другий ярус не
входить до `0.4.2`.

Вхід `LEFT_PASSAGE_PARTY_ATTACK_ENABLED` default-off. Код у repository release
не доводить production enablement, deployment чи ручну Telegram QA; ці докази
лишаються pending.

Відкладені бойові follow-ups без номера релізу:

- PR `#189` shipped direct worker supervision, bounded restart and rotating
  isolated-runtime logs; це більше не backlog;
- privacy-safe бойовий debug log для зависань і переходів сесій:
  session/rules/turn/state category та scheduler/CAS/settlement stage без
  приватних payloads;
- спільна восьмивимірна статистика внеску для звичайних боїв, тренування,
  дуелей і Big Barrel/raid після окремого cross-mode contract review. Це не
  розширює `0.4.2` і не починає `0.4.5`.

### 0.4.3 — Consumable manatky

Усі двадцять current consumables отримують exhaustive exact-id typed contract:
три medical supplies зберігають чинну поведінку, дві authored cellar манатки та
generated `c001`–`c015` активують відповідні immediate self/pair/party,
resource, cleanse, cooldown, damage і response effects. `c001/c003/c009`
  лікують рівно на 7/8/9 HP у бою та поза ним. Full/inapplicable state не витрачає
  предмет або хід; cooldown reduction checks after the ordinary action tick,
  and response guard/evade affects exactly one canonical enemy response. Random outcome freezes once and replays. Quest bottle is
protected until its `keep` ending, while remort-carried stacks stay usable.
Source tags/effect ids не вмикають прихованої поведінки. A catalog-specific
rollout flag is not used: all twenty exact mappings are active
where their existing inventory/combat surface is available. Existing stacks
require no data migration; take-away purchase shelf remains separate `0.4.10`.

PR `#188` merged this repository release. Target deployment, production
availability and manual Telegram QA remain pending evidence.

### 0.4.4 — Bugfix & Polish

Compact GroupCombat cards now commit attacks and explicit abilities directly
when exactly one canonical target remains, and open target-only pickers for two
or more targets. Enemy focus starts on the living party leader, then follows
the participant with the most actual damage in the previous resolved turn and
is marked on active cards. Left-passage invite links are origin-bound and can
atomically relocate an otherwise eligible joiner, while blocked joins keep
location unchanged. Owned gated equipment is marked `🔎 🔒` from one shared
in-memory requirement projection; detail remains available and never offers
Equip while locked. No migration, ґільдія runtime or new rollout flag is
included.

PR `#191` merged this repository release and production reported SQLite
contention while GroupCombat published several canonical cards concurrently.
The unnumbered follow-up publishes the initiating player first, returns the
active callback before a session-scoped serial ally tail, and queues every
active, scheduler and terminal delivery for that session behind the same tail.
Each operation finalizes only its frozen delivery revision through repository
CAS. Completed left-passage invitation replays replace the participant's exact
terminal result reference instead of returning silently after exit delivery;
combat rules, rewards, schema and the `0.4.5` scope do not change.
Formal final-hotfix Telegram QA remains pending.

### 0.4.5 — Guild foundation

Малий соціяльний shell: один 13-хвилинний preview, exact-once особиста плата
587 золота, семиденний forming charter, target-bound opt-in invitations,
leader/officer/member, leader-only crest/description edit і приватний audit.
Активний склад має current cap 8; joining безкоштовний. Майбутнє окреме
розширення може підняти межу конкретної ґільдії щонайбільше до 13, але цей
release не містить ціни, entitlement чи кнопки розширення. Історична назва лишається,
а окрема reservation звільняється після bounded expiry/disband hold.

Тринадцять catalog crest є exclusive для forming/active статутів і
звільняються terminal lifecycle. Засновник або голова може натомість
запропонувати один власний емоджі; фото, файли й посилання не приймаються.
Transactional unique reservation вирішує catalog/custom create/edit races без
gold чи cooldown для програвшого засновника. Особиста картка запрошення має 13
різних текстів; їх ротація не замінює чинне приватне посилання.

PR `#190` готує repository release `0.4.5` із цим shell та окремим
`🪺 Гніздом ґільдій` при Спуску. Active-only public directory ділить
`PRESENCE_LOCATION_KORCHMA_DEEP`; нова головна клавіатура не має окремого
ґільдійного рядка, а приватне відновлення через `/guild`, адресні посилання й
картку персонажа працює звідусіль.
Усе це лишається за default-off `GUILD_FOUNDATION_ENABLED`. Membership належить користувачеві й переживає
remort, а party/combat лишаються current-life контрактами без Guild foreign key.
`/guild_party` лише показує members для вже чинного real-gameplay recruiting
`PartySession` і перевикористовує ordinary invite/join/canonical-card flow;
generic guild lobby немає. PR #190, migration deployment, target flag і ручна
триакаунтова Telegram QA лишаються окремими непідтвердженими доказами. Production
enablement також чекає audited abandoned-leader operator runbook; automatic
succession за presence/activity не дозволений.

### 0.4.6 — Guild weekly goal

Одна тижнева групова мета, що використовує звичайні PartySession +
GroupCombatSession. Нагорода social/cosmetic first; учасники без ґільдій не
втрачають базову solo/party progression. Цей slice також проводить явний аудит
кожного класового прийому, що вже працює у PartyBoss/Big Barrel: або додає
рівнозначну типізовану дію в GroupCombat із тестами, або документує raid-only
причину та окремого майбутнього власника.

### 0.4.7 — Старий жертовник

Gold-only MVP із `Благоволінням` і обрядом Жерця. Перед реалізацією один
канонічний blessing-aware summary contract має довести, що заявлений stat bonus
справді однаково діє або чесно не діє у solo, duel, PartyBoss і GroupCombat.
Манатки й окрема локація до цього slice не входять.

### 0.4.8 — Greeting buff

Одна тепла дія `👋 Привітатися` з одним bounded target status і `93`-хвилинним
actor-target wait. До коду треба обрати рівно один ефект і його stacking/time
policy проти напоїв, `Ситого`, Натхнення та благословення; XP/gold bonus не є
рекомендованим MVP.

### 0.4.9 — Їжа Шинку

Один активний food buff, до трьох авторських страв, явна покупка/заміна й
канонічне споживання/expiry. Це їжа, зʼїдена зараз, без coffee cooldown state,
five-buff stacking-а та carried items. До runtime треба затвердити exact
ids/prices/effects/modes, interaction matrix і окремий food-owned status.

### 0.4.10 — Shynok take-away consumables

Окремий replay-safe take-away shelf використовує лише вже затверджений
`0.4.3` exact catalog. Він не розширює typed effect family і не змішує carried
манатки з їжею, випитою або зʼїденою одразу.

### 0.4.11–0.4.12 — Resale і Korchmar recycling

Поточний продаж Корчмарю за 42% уже shipped. `0.4.11` додає лише server-owned
resale listings для sold units із `goldValue >= 93`, atomic sale intake receipt
та opaque exact-once purchase receipt. `0.4.12` окремо додає bounded neutral
recycling після freezing batch identity/order/seed/outcome/repair policy, без
player LUCK/achievements і без scheduler-а.

### 0.4.13 — Guild cosmetic progression

Невеликий XP/level шар ґільдії, earned cosmetic milestones/frames і season-zero recap лише
після достатніх даних тижневої мети. Пізніший номер дає зібрати ці дані, поки
виходять старі social/economy promises. XP іде один раз із canonical
guild-period completion receipt, не множиться на participant receipts; жодного
бойового pay-to-win бонусу. Власні емоджі-герби вже належать identity surface
`0.4.5`; `0.4.13` їх не дублює й не продає.

### Не входить у 0.4.x foundation

- guild bank або спільний інвентар;
- повний trade/market/auction house;
- guild wars, forced PvP або ставки;
- raid finder, world-scale chat, ватаги понад трьох або encounters понад шість
  ворогів;
- одночасна міграція Big Barrel на новий runtime;
- Redis/Mini App як передумова;
- широкий рефакторинг усіх solo/duel orchestration layers.

### Майбутні ґільдійні slices після foundation

Досвід інших Telegram RPG зафіксовано як research, а не як готовий контракт чи
макет для копіювання. Окремими задачами можна розглянути:

- private/public рекрутинг, короткий анонс, безпечний внутрішньоігровий контакт,
  заявки зі списку ґільдій і кнопкове схвалення/відмову;
- особисті та спільні contribution-квести після доказів `0.4.6`, з canonical
  receipts, anti-farming і exact-once settlement;
- казну та зрозумілий журнал надходжень/витрат лише після окремого economy й
  abuse review;
- розширення початкових 8 місць до абсолютної межі 13 через окремо погоджений
  progression/structure контракт;
- bounded ґільдійний чат і системний журнал подій лише з moderation, retention,
  flood-control та privacy policy;
- споруди, але бойові HP/attack/defence бонуси — лише після повної перевірки
  solo, duel, Big Barrel, PartyBoss і GroupCombat та без pay-to-win;
- союзи, дипломатію, території, податки й ґільдійне PvP як пізні незалежні
  seasonal systems із opt-in conflict, collusion і abandoned-leader policy;
- XP/рівні та earned cosmetic frames у напрямі `0.4.13`, не як автоматичний
  дозвіл на казну, території чи спільну бойову силу.

`0.4.5` лишається read-only у public directory та target-bound у вступі. Кожен
пункт вище потребує власної нумерованої задачі, міграції/rollback за потреби,
QA-матриці й окремого продуктового рішення; реалізація одного не відкриває решту.

## Closed-alpha evidence, яке збираємо паралельно

Технічні/performance й combat-balance вимірювання вже існують. Бракує не
«аналітики взагалі», а вузького privacy-safe продуктового зрізу:

- character creation completion;
- D1/D7 return cohorts;
- 3 PvE actions у перший день;
- duel challenge → accept → rematch;
- party create → join → start → finish;
- guild invite → join і weekly participation після появи ґільдій;
- stale callback, permanent delivery failure і combat repair rates;
- категоризований feedback без зберігання зайвих персональних даних.

Admin allowlist із раннього roadmap не є автоматичною вимогою. Перед closeout
треба явно обрати: він потрібен для реального closed-alpha каналу або retired як
невідповідний фактичному public-bot rollout.

## Відкладений backlog

Не загублено, але не блокує `0.4.0`–`0.4.3`:

- Rogue reputation/location risk;
- ширший Hunt/Єгер loop і колекції;
- manatka-offerings і можлива окрема root-grove location для Старого жертовника;
- item instances, двостороння торгівля й ринок;
- fuller Big Barrel rewards та перенесення на generic runtime;
- [окрема бойова reply-клавіатура](../backlog/dedicated-combat-reply-keyboard.md)
  замість основної під час активного бою — лише після доведення durable
  ordering, restart recovery та відсутности keyboard-less станів;
- сезони, guild wars, crafting, web/Mini App.

Нумеровані `0.4.3` і `0.4.7`–`0.4.12` tasks активують bounded частини старих
drafts.
Решту ідей треба активувати новим versioned task після даних, а не запускати
старий `0.2.x-*` draft verbatim.
