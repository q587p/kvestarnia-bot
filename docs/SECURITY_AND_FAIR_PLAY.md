# Security and Fair Play

## Принцип
Гра має бути чесною, безпечною і не збирати зайвих даних. Telegram callback-и та команди — недовірене введення.

## Дані користувача
Зберігати мінімум:
- Telegram user id.
- username/display name, якщо доступно.
- language code, якщо потрібно.
- ігровий стан.

Не зберігати:
- повні приватні повідомлення без явної потреби.
- телефон, email, контакти.
- токени або персональні дані в логах.

## Секрети
- Bot token тільки в env/secret manager.
- `.env` не комітити.
- `.env.example` без реальних значень.
- Logs не мають містити token або webhook secret.

## Rate limits
MVP limits:
- `/adventure`: cooldown game design + technical rate limit.
- callback combat action: 1 дія на активний turn.
- `/raid`: group-level cooldown.
- admin commands: allowlist + audit log.

## Idempotency
Усі нагороди видавати в транзакції з idempotency key.

Приклади:
- combat finish reward.
- raid reward.
- daily reward.
- level-up grant.
- remort/reset-like prestige flows.

Повторний запит має повертати попередній результат або «вже зараховано».

`/remort` з `0.1.2` є irreversible progression flow, не `/restart`: draft і completed remort records мають бути token-scoped, replay-safe і transaction-backed. Повторний confirm не може додати ще один remort count, legacy bonus або збережені манатки; зміни inventory/equipment між preview і confirm мають або безпечно відхилити confirm, або replay-нути вже завершений результат. Unknown/archived item ids не можна переносити приховано: якщо вони лишаються можливими для carry-over, вони мають бути видимими fallback-рядками й рахуватися в той самий selected limit.

`0.1.3` додає reliability rows без нових нагород: `barrel_raid_notifications` тільки відновлює/надсилає завершальні повідомлення навколо наявного idempotent Barrel reward claim, а старі pending `mantok_chest_runs` переходять у `expired` без списання манаток або створення output.

`0.1.5` додає `/spar` проти `Сумлінного Допельґанґера` як level 3+ XP-only тренувальний бій без PvP state, target-player state, duel ledger, ставки або donor/pay state. Герої 1-2 рівня бачать friendly gate і не створюють training session, cooldown або reward state. Завершення тренування може видати тільки малий idempotent XP через session-scoped reward key і може оновити HP/ману персонажа та cooldown відновлення; воно не видає золото, items, манатки, титули, ранги, quest progress або доступ до фіч. Повторний callback має replay-нути вже записаний результат без додаткового XP, resource drain або нагород. Перший player-vs-player duel slice має бути level 3+ і перейти на server-side ledger/replay boundary, ownership checks і consent flow до будь-якої мутації.

`0.1.6` problem-chain issue/turn-in uses existing `daily_actions` idempotency rows instead of a new quest table. Each stage, including the first one, has a separate issue/reward key with `local_date = once`; `0.1.7` keeps stage `13` legacy-compatible by counting old ordinary won solo fights until `quest.thirteen-small-problems` is claimed, while stages `23`, `42` and `93` count only ordinary won solo fights after the stage issue timestamp. Repeated `v1:quest:problem` callbacks must either replay the already-issued next stage or report that the current stage is not ready, without duplicating XP, gold or item grants. Training doppelganger sessions, future duel sessions and group/raid sessions must stay excluded unless a later economy/security review explicitly changes that.

`0.1.9` combat flavor intents are presentation-only for `/spar`: they may add escaped text lines and semantic tags, but they must not create reward state, change quest counters, mutate cooldowns, bypass callback ownership/turn checks or expose hidden formulas. Any later numeric tactics modifier needs a separate tested balance/security review.

`0.1.10` duel invites are opt-in, level 3+, rewardless and ledger-backed. Challenge creation, accept, decline, cancel, expiry and result replay must stay transactional/idempotent through `duel_challenges`; old buttons may replay state but must not reroll a result. Invite recipients without a character receive onboarding copy instead of a hard failure. Partial HP or mana shows an explicit warning before accept, but the player can still proceed deliberately. The first slice must not add wagers, rating, item loss, quest progress, reward grants, rematch automation or tournament state.

## Callback validation
Callback data має:
- мати версію.
- відповідати regex/parser.
- перевіряти ownership: цей combat належить цьому character.
- перевіряти статус: combat active, raid open.
- перевіряти turn/cooldown.

## Group privacy
У групах:
- Не показувати зайві приватні дані.
- Дати admins спосіб вимкнути шумні повідомлення.
- Не тегати всіх без причини.
- Не писати надто часто автоматично.

## Anti-cheat MVP
- Detect duplicate callbacks.
- Detect impossible action frequency.
- Detect combat reward duplication.
- Detect multi-account abuse heuristics, але не банити автоматично без review.
- Log suspicious events.

## Admin safety
Admin commands:
- працюють тільки для allowlisted Telegram IDs.
- логуються.
- потребують confirm для destructive actions.
- не дають виконувати raw SQL з Telegram.

## Payments / monetization
До стабільної альфи краще без платежів.

Коли платежі з’являться:
- Тільки косметика/підтримка.
- Чітко показувати, що купує гравець.
- Не продавати loot boxes за реальні гроші без юридичної перевірки.
- Player-facing правило можна формулювати так: «Ніяких лутбоксів тут! Ну, хіба що смішні будуть.» Це означає: жодної оплати за силу або азартної монетизації; максимум прозорі косметичні/жартівні коробки без P2W.
- Не робити P2W.

### Банка підтримки

`Банка підтримки Квестарні` є добровільною підтримкою, а не payment-to-gameplay integration. У `0.1.1` є тільки link plumbing: optional `SUPPORT_JAR_URL`, `/support`, secondary homepage block and `/start support_thanks`. Канонічний backlog: [SUPPORT_JAR_BACKLOG.md](SUPPORT_JAR_BACKLOG.md). Майбутній read-only live status через Monobank API описаний окремо: [SUPPORT_JAR_LIVE_STATUS.md](SUPPORT_JAR_LIVE_STATUS.md).

Guardrails:

- deep link `support_thanks` не підтверджує оплату;
- не зберігати donor state без окремого privacy/legal рішення;
- не видавати XP, золото, items, манатки, екіпірування, рейтингові записи або доступ до фіч;
- не показувати битий support URL, якщо `SUPPORT_JAR_URL` не налаштований або не проходить validation;
- `SUPPORT_JAR_URL` у першому runtime-slice приймає тільки `https://send.monobank.ua/jar/...` без URL credentials;
- не лоґувати персональні платіжні дані;
- не називати це благодійністю, якщо юридично це не благодійний збір.

Future live status guardrails:

- `MONOBANK_API_TOKEN` має бути тільки server-side secret;
- не читати statement/webhook endpoints для live aggregate status;
- не лоґувати token, full Monobank response, account data або individual payment details;
- кешувати status і не викликати `client-info` частіше за API limit;
- live status показує тільки агреговані current/goal values і не підтверджує оплату.

## Moderation
Потрібно передбачити:
- blocklist для назв ґільдій/персонажів.
- report command.
- soft delete/rename offensive names.
- admin review queue для user-generated content.

## Backups
- Щоденний backup PostgreSQL.
- Перевіряти restore.
- Не зберігати backup у публічному bucket.

## Incident checklist
1. Зупинити нагороди/рейди, якщо exploit економіки.
2. Зробити snapshot БД.
3. Визначити affected users/items.
4. Патч + тест на exploit.
5. Компенсація або rollback.
6. Коротке чесне повідомлення спільноті.
