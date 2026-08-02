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
| Party Progression | активна | `0.4.4` guild foundation; `0.4.5` наступна |
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

Відкладені runtime і бойові follow-ups без номера релізу:

- надійна діягностика isolated local bot: bounded rotating stdout/stderr
  crash-log поза repository з snapshot SHA, PID tree, timestamps, exit code,
  health/polling state та дозволеною error category без token, Telegram ids,
  приватного тексту, callback payloads, SQL-параметрів і сирих state/exception;
- local-runtime worker watchdog: manager і `status-local-bot.cmd` мають
  перевіряти фактичний bot worker та `/health`, а не лише живу npm/`ts-node-dev`
  оболонку; загиблий worker із живим wrapper позначається як failed, лишає
  придатний crash-log і отримує bounded restart/recovery contract із тестами;
- privacy-safe бойовий debug log для зависань і переходів сесій:
  session/rules/turn/state category та scheduler/CAS/settlement stage без
  приватних payloads;
- спільна восьмивимірна статистика внеску для звичайних боїв, тренування,
  дуелей і Big Barrel/raid після окремого cross-mode contract review. Це не
  розширює `0.4.2` і не починає `0.4.4`.

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
require no data migration; take-away purchase shelf remains separate `0.4.9`.

### 0.4.4 — Guild foundation

Малий соціяльний shell: один 13-хвилинний preview, exact-once особиста плата
93 золота, семиденний forming charter, target-bound opt-in invitations,
leader/officer/member, leader-only crest/description edit і приватний audit.
Активний склад має hard cap 8; joining безкоштовний. Історична назва лишається,
а окрема reservation звільняється після bounded expiry/disband hold.

Repository release `0.4.4` реалізує цей shell за default-off
`GUILD_FOUNDATION_ENABLED`. Membership належить користувачеві й переживає
remort, а party/combat лишаються current-life контрактами без Guild foreign key.
`/guild_party` лише показує members для вже чинного real-gameplay recruiting
`PartySession` і перевикористовує ordinary invite/join/canonical-card flow;
generic guild lobby немає. PR #190, migration deployment, target flag і ручна
триакаунтова Telegram QA лишаються окремими непідтвердженими доказами. Production
enablement також чекає audited abandoned-leader operator runbook; automatic
succession за presence/activity не дозволений.

### 0.4.5 — Guild weekly goal

Одна тижнева групова мета, що використовує звичайні PartySession +
GroupCombatSession. Нагорода social/cosmetic first; учасники без ґільдій не
втрачають базову solo/party progression.

### 0.4.6 — Старий жертовник

Gold-only MVP із `Благоволінням` і обрядом Жерця. Перед реалізацією один
канонічний blessing-aware summary contract має довести, що заявлений stat bonus
справді однаково діє або чесно не діє у solo, duel, PartyBoss і GroupCombat.
Манатки й окрема локація до цього slice не входять.

### 0.4.7 — Greeting buff

Одна тепла дія `👋 Привітатися` з одним bounded target status і `93`-хвилинним
actor-target wait. До коду треба обрати рівно один ефект і його stacking/time
policy проти напоїв, `Ситого`, Натхнення та благословення; XP/gold bonus не є
рекомендованим MVP.

### 0.4.8 — Їжа Шинку

Один активний food buff, до трьох авторських страв, явна покупка/заміна й
канонічне споживання/expiry. Це їжа, зʼїдена зараз, без coffee cooldown state,
five-buff stacking-а та carried items. До runtime треба затвердити exact
ids/prices/effects/modes, interaction matrix і окремий food-owned status.

### 0.4.9 — Shynok take-away consumables

Окремий replay-safe take-away shelf використовує лише вже затверджений
`0.4.3` exact catalog. Він не розширює typed effect family і не змішує carried
манатки з їжею, випитою або зʼїденою одразу.

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
- raid finder, world-scale chat, ватаги понад трьох або encounters понад шість
  ворогів;
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
- [окрема бойова reply-клавіатура](../backlog/dedicated-combat-reply-keyboard.md)
  замість основної під час активного бою — лише після доведення durable
  ordering, restart recovery та відсутности keyboard-less станів;
- сезони, guild wars, crafting, web/Mini App.

Нумеровані `0.4.3` і `0.4.6`–`0.4.11` tasks активують bounded частини старих
drafts.
Решту ідей треба активувати новим versioned task після даних, а не запускати
старий `0.2.x-*` draft verbatim.
