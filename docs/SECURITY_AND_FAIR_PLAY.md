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

Повторний запит має повертати попередній результат або “вже зараховано”.

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
- Не робити P2W.

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
