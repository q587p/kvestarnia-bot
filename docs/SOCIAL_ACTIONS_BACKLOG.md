# Social Actions Backlog

Цей backlog описує group/social features, які добре йдуть після першого групового рейду.

## 1. Buy a round for people currently in the korchma

Player value:
- дає просту соціальну дію без бойової складності;
- створює корчемний жарт і маленький gold sink.

Minimum implementation:
- один командний або callback flow;
- список присутніх у корчмі;
- підтвердження перед витратою золота;
- простий thank-you summary.

Abuse risk:
- спам;
- gold drain на інші акаунти;
- надмірні повідомлення в групі.

Required data:
- presence snapshot;
- character gold;
- action log/idempotency key.

Solo-compatible:
- так, якщо дія дозволяє пригостити NPC/корчму або просто себе.

## 2. Invite nearby players to a raid

Player value:
- робить груповий hook видимим і запрошуваним;
- зменшує friction перед рейдом.

Minimum implementation:
- коротке запрошення з кнопкою;
- mention-free або privacy-safe invite mechanic;
- cooldown на повторне запрошення.

Abuse risk:
- спам згадок;
- надто часті push-повідомлення;
- pressure на гравців.

Required data:
- group chat id;
- presence / nearby players list;
- invite cooldown state.

Solo-compatible:
- частково, якщо invite можна адресувати одному гравцю або відкласти в чергу.

## 3. Front-of-korchma public board

Player value:
- додає вітрину досягнень і живий social surface;
- добре працює як асинхронний вхід у гру.

Minimum implementation:
- paginated board біля входу;
- recent arrivals або recent level-ups;
- один короткий highlight рядок.

Abuse risk:
- спам оновлень;
- приватність імен;
- перевантаження текстом.

Required data:
- level-up events;
- arrival events;
- visibility/privacy rules.

Solo-compatible:
- так.

## 4. Recent level-up celebration

Player value:
- святкує прогрес без складної економіки;
- створює соціальний шум навколо росту героя.

Minimum implementation:
- окремий announcement message;
- кнопка/посилання на героя;
- ідемпотентний event log.

Abuse risk:
- дублювання повідомлень;
- спам при повторних callback-ах;
- зайва публічність у групі.

Required data:
- level-up event row;
- last announced level;
- group target rules.

Solo-compatible:
- так, але краще відразу думати про груповий surface.

## 5. Generosity / rank shoutouts

Player value:
- підсилює соціальний винахідливий стиль гри;
- можна смішно винагороджувати щедрість без P2W.

Minimum implementation:
- daily/weekly summary;
- короткий title або shoutout;
- чіткий tie-breaker.

Abuse risk:
- farming shoutouts;
- self-promotion;
- leaderboard manipulation.

Required data:
- purchase/round events;
- leader summary row;
- deterministic ranking fields.

Solo-compatible:
- так.

## 6. Party gathering flavor

Player value:
- робить груповий збір не тільки механікою, а сценою;
- допомагає перед рейдом.

Minimum implementation:
- one-liner group flavor;
- join/leave state;
- short status card.

Abuse risk:
- noisy notifications;
- false social pressure;
- repeated empty gatherings.

Required data:
- current group state;
- participant count;
- optional presence.

Solo-compatible:
- так, якщо flavour може працювати і без повного складу.

## 7. Social action cooldowns

Player value:
- зберігає чат від спаму;
- дозволяє соціальним діям бути частими, але не безкінечними.

Minimum implementation:
- one cooldown per social action key;
- clear remaining time text;
- soft deny messages.

Abuse risk:
- accidental over-blocking;
- confusing UX if cooldowns are too opaque.

Required data:
- cooldown rows;
- action key;
- available_at timestamp.

Solo-compatible:
- так.

## General backlog rules

- Соціальні дії мають бути короткими.
- Кожна дія повинна мати зрозумілу користь для чату.
- Якщо дія потребує окремого state machine, її слід відкласти до наступного phase slice.
- Нагороди не повинні бути настільки сильними, щоб соціальні дії ставали обов’язковим гриндом.
