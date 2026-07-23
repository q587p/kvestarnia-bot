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
| Party Progression | активна | `0.4.0` repository proof; `0.4.1` наступна |
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
- Межа першого runtime: 2–3 пригодники проти 2–3 ворогів. Масштаб понад 3×3 —
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

Наступна планована версія; її реалізацію ще не розпочато.

Довести універсальний runtime до feature parity: ally targeting, heal/guard,
multi-enemy AI/threat, gear/items/statuses, strict repair, restart/remort policy,
settlement skeleton, concurrency/load tests і simulator coverage.

### 0.4.2 — Guild foundation

Малий соціяльний shell, який не чекає готового guild boss: унікальна
нормалізована назва, emoji-герб, create gold sink, invite/join/leave,
leader/officer/member та audit. Ґільдія може лише зручніше створити звичайний
`PartySession`; вона не володіє combat state.

### 0.4.3 — First party expedition

Перший production encounter 2–3×2–3 із location/quest/lore входом,
idempotent per-player rewards/resource settlement, contribution summary,
journal, achievements/activity events, metrics і kill switch.

### 0.4.4 — Guild weekly goal

Одна тижнева групова мета, що використовує звичайні PartySession +
GroupCombatSession. Нагорода social/cosmetic first; учасники без ґільдій не
втрачають базову solo/party progression.

### 0.4.5 — Старий жертовник

Gold-only MVP із `Благоволінням` і обрядом Жерця. Перед реалізацією один
канонічний blessing-aware summary contract має довести, що заявлений stat bonus
справді однаково діє або чесно не діє у solo, duel, PartyBoss і GroupCombat.
Манатки й окрема локація до цього slice не входять.

### 0.4.6 — Greeting buff

Одна тепла дія `👋 Привітатися` з одним bounded target status і `93`-хвилинним
actor-target wait. До коду треба обрати рівно один ефект і його stacking/time
policy проти напоїв, `Ситого`, Натхнення та благословення; XP/gold bonus не є
рекомендованим MVP.

### 0.4.7 — Їжа Шинку

Один активний food buff, до трьох авторських страв, явна покупка/заміна й
канонічне споживання/expiry. Це їжа, зʼїдена зараз, без coffee cooldown state,
five-buff stacking-а та carried items. До runtime треба затвердити exact
ids/prices/effects/modes, interaction matrix і окремий food-owned status.

### 0.4.8–0.4.9 — Consumable manatky

Спершу затвердити exact ids/effects для трьох-чотирьох existing stack-ів. Current
`ItemUseOrder` є HP-heal-specific, тож v1 або лишається HP-only, або явно додає
одну typed effect family. Потім — окремий replay-safe take-away shelf. Не
інтерпретувати legacy `effect_id` автоматично.

### 0.4.10–0.4.11 — Resale і Korchmar recycling

Поточний продаж Корчмарю за 42% уже shipped. `0.4.10` додає лише server-owned
resale listings для sold units із `goldValue >= 93`, atomic sale intake receipt
та opaque exact-once purchase receipt. `0.4.11` окремо додає bounded neutral
recycling після freezing batch identity/order/seed/outcome/repair policy, без
player LUCK/achievements і без scheduler-а.

### 0.4.12 — Guild cosmetic progression

Невеликий XP/level шар ґільдії, косметичні milestones і season-zero recap лише
після достатніх даних тижневої мети. Пізніший номер дає зібрати ці дані, поки
виходять старі social/economy promises. XP іде один раз із canonical
guild-period completion receipt, не множиться на participant receipts; жодного
бойового pay-to-win бонусу.

### Не входить у 0.4.x foundation

- guild bank або спільний інвентар;
- повний trade/market/auction house;
- guild wars, forced PvP або ставки;
- raid finder, world-scale chat або encounters понад 3×3;
- одночасна міграція Big Barrel на новий runtime;
- Redis/Mini App як передумова;
- широкий рефакторинг усіх solo/duel orchestration layers.

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
- сезони, guild wars, crafting, web/Mini App.

Нумеровані `0.4.5`–`0.4.11` tasks активують bounded частини старих drafts.
Решту ідей треба активувати новим versioned task після даних, а не запускати
старий `0.2.x-*` draft verbatim.
