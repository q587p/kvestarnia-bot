# Старі social/economy promises: де вони й куди повертаються

## Що було не так у першій версії аудиту

Фічі не зникли з репозиторію, але пакет зробив їх неactionable: один deferred
булет, жодного релізного слота, окремих задач або промптів. Це особливо неточно
для resale: аудит від `12026-07-07` прямо ставив його в `later 0.3.x`, але новий
план не пояснив перенесення.

## Матриця

| Напрям | Уже shipped | Реально deferred | Головний gate | Запропонована адреса |
| --- | --- | --- | --- | --- |
| Старий жертовник | yard/presence, Priest aid, selected-stat status model | gold offerings, favor ledger, altar rite | blessing-aware summary parity у всіх боях | `0.4.5` |
| Greeting | `Хто поруч`, presence, cooldown/status patterns | target gesture + one support effect | вибрати один effect і stacking/time policy | `0.4.6` |
| Їжа | Shynok drinks, `Ситий` support | meal bought/eaten now + one food status | one-vs-five conflict; canonical status consumption | `0.4.7` |
| Consumables | bandages, `ItemUseOrder`, `Разові`, medical combat actions | curated nonmedical uses and take-away shelf | explicit allowlist; group item exact-once proof | `0.4.8`–`0.4.9` |
| Resale | sale to Korchmar for 42% basket payout rounded up | public server-owned resale listings | concurrent buyer/stock/fingerprint transaction | `0.4.10` |
| Recycling | Friendly Chest player flow | neutral Korchmar five-unit pool/batches | no player LUCK/achievement semantics; bounded work | `0.4.11` |

## Важливі технічні рішення

### Старий жертовник

Документаційно це найготовіша стара фіча: task, design, balance, Ukrainian copy,
QA і старий Codex prompt уже є. Але runtime-readiness нижча, ніж здається.
`NoncombatPriestBlessing` може показувати stat у summary surfaces, тоді як частина
combat starts/freeze paths будує summary без активного blessing. До коду потрібен
один канонічний контракт або явне noncombat-only рішення.

Gold, favor, mana й blessing мутації мають бути атомарними; favor не переноситься
через remort. Active blessing/wait має бути привʼязаний до обох character lives,
бо поточне Priest storage не гарантує remort cleanup. `ActiveCombatLease` і
legacy non-lease busy flows блокують rite; recruiting PartySession policy
фіксується окремо. Manatka offerings і `Тихий Корінь` не входять у MVP.

### Greeting

Старий draft перелічує чотири альтернативи, а не одну специфікацію. Рекомендований
напрям — малий out-of-combat recovery support, strongest-only проти Shynok
recovery, без XP/gold. Але це має бути окремо схвалено: треба визначити settlement
windows, поведінку часу в бою, replacement і global target status.
Activation receipt, status і wait мають actor+target life identity: generic
cooldown row сам по собі може пережити remort.

### Їжа проти consumables

Їжа — куплена й зʼїдена зараз, створює один server-owned status. Consumable —
предмет у stack inventory, який можна використати пізніше й який потребує
reservation/exact-once consume. Не змішувати їх у PR.

Food MVP має один active buff, хоча старі balance/backlog notes дозволяли пʼять.
Він потребує окремого food-owned status: перевикористання one-row drink storage
скинуло б чинний напій. Exact meal ids/prices/effects/modes та interaction matrix
є activation gate, не рішення implementation Codex. Coffee positive/rebound
cooldown state — окрема майбутня механіка, не «ще одна страва».

Для consumables не можна автоматично увімкнути всі legacy generated `effect_id`:
частина описує initiative/crit/party/raid power. Поточний `ItemUseOrder` у runtime
HP-heal-specific, тому catalog gate має або лишити 3–4 OOC items HP-only, або
схвалити рівно одну typed effect/result/status extension. Потім окремий take-away
purchase ledger із явною remort policy.

### Resale і recycling

Public resale listing може бути агрегатом `itemId + semantic fingerprint + unitPrice + quantity`;
item instances не потрібні. Intake + unique sale/line
receipt входить у чинну sale/payout transaction. Кожна покупка має opaque
buyer-life intent і terminal receipt; claim, gold, listing та inventory — одна
транзакція. При content drift listing quarantine-иться.

Recycling не повинен повторно використати player-owned `MantokChestRun`, бо це
принесе character LUCK/achievements у нейтральну систему. Потрібні атомарний
source-sale intake receipt і окремий Korchmar batch із id, rules version,
ordered frozen inputs/fingerprints, seed, persisted outcome та repairable
blocked-no-candidate. Максимум 1–3 batches на trigger, без scheduler-а.

## Item-instance cutline

Перші bounded altar/consumable/resale slices працюють на поточному
`itemId + quantity + fingerprint` contract, якщо весь equipped stack захищено й
усі gift/mail/use/chest/barter/upgrade/group-action reservations перечитуються в
транзакції. Item instances потрібні лише для mutable per-copy properties,
split-stack equipment, seller provenance або two-sided trade custody.

Перед третім destructive item sink треба виділити спільний read-only
eligibility/reservation helper, щоб altar, resale й group items не мали різних
переліків «що зараз зарезервовано».
