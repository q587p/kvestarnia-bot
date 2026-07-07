# Live Status для Банки підтримки

Цей документ фіксує майбутній окремий slice для read-only live status `Банки підтримки Квестарні` через офіційний Monobank API.

Поточний runtime `0.1.1` уже має безпечну основу: optional `SUPPORT_JAR_URL`, вторинну команду `/support`, сайтова картка підтримки за наявности URL і `/start support_thanks`. Live status ще не реалізований.

## Мета

Показувати агрегований стан Банки без ручного оновлення суми в env:

```text
🫙 Банка підтримки Квестарні

Квестарня безкоштовна: жодної купівлі сили, луту, золота чи прогресу.

Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.

У Банці зараз: 1 234 грн
Ціль: 5 000 грн
Оновлено: 12026-06-16 19:42 Europe/Kyiv

Підтримати: https://send.monobank.ua/jar/<send-id>
```

Це не payment integration: бот не підтверджує оплату, не читає окремі платежі, не зберігає donor state і не видає ігрових переваг.

## Джерело API

Офіційні docs: `https://api.monobank.ua/docs/index.html`, перевірено `12026-06-16`.

Потрібний future endpoint:

```http
GET https://api.monobank.ua/personal/client-info
X-Token: <MONOBANK_API_TOKEN>
```

Зафіксовані факти для майбутньої реалізації:

- `client-info` повертає клієнта, рахунки й `jars[]`;
- endpoint має ліміт не частіше ніж 1 раз на 60 секунд;
- у `jars[]` є `id`, `sendId`, `title`, `description`, `currencyCode`, `balance`, `goal`;
- webhook і statement існують, але для aggregate status не потрібні й не входять у цей slice.

## Future scope

Додати тільки read-only aggregate status:

- optional secret env `MONOBANK_API_TOKEN`;
- optional `SUPPORT_JAR_STATUS_TTL_SECONDS`, default `300`, minimum `60`;
- optional `MONOBANK_API_TIMEOUT_MS`, default `5000`;
- server-side Monobank client тільки для `GET /personal/client-info`;
- helper, який дістає `sendId` із `SUPPORT_JAR_URL`;
- service, який знаходить `jar.sendId === sendId`, перевіряє UAH `currencyCode === 980` і повертає balance/goal;
- in-memory cache з TTL і in-flight request coalescing;
- calm fallback, якщо token відсутній, API недоступний, jar не знайдена, відповідь невалідна, валюта не UAH або rate limit;
- `/support` і public homepage можуть показати live aggregate status, якщо він доступний.

Manual status env із `0.1.1` після цього slice треба прибрати з офіційного player-facing шляху або лишити недокументованим fallback-ом нижчого пріоритету:

```env
SUPPORT_JAR_CURRENT_UAH=
SUPPORT_JAR_GOAL_UAH=
SUPPORT_JAR_STATUS_UPDATED_AT=
```

## Non-goals

Не додавати:

- Monobank webhook;
- `/personal/statement/...`;
- scraping `send.monobank.ua`;
- payment confirmation;
- donor table, donor state, donor list;
- donor badges, ranks, titles або premium status;
- XP, золото, лут, манатки, рівні, бойову силу, прогрес або доступ до фіч;
- DB migration;
- реальний Monobank URL або token у репозиторій;
- логи з token-ом, full `client-info` response або персональними банківськими полями.

## Config sketch

Майбутня production-конфігурація:

```env
SUPPORT_JAR_URL=https://send.monobank.ua/jar/<real-send-id>
MONOBANK_API_TOKEN=<secret-personal-token>
SUPPORT_JAR_STATUS_TTL_SECONDS=300
MONOBANK_API_TIMEOUT_MS=5000
```

Rules:

- `MONOBANK_API_TOKEN` server-side only; не показувати у фронтенді, Telegram, docs, snapshots, error messages або logs;
- app має працювати без token-а, просто з fallback copy;
- TTL не може бути меншим за 60 секунд;
- tests мають mock-ати API й не робити real Monobank calls.

## Data flow

```text
/support або homepage render
  -> якщо SUPPORT_JAR_URL відсутній: support block hidden/fallback
  -> якщо MONOBANK_API_TOKEN відсутній: calm fallback
  -> extract sendId із SUPPORT_JAR_URL path /jar/<sendId>
  -> якщо fresh cache є: повернути cache
  -> якщо refresh уже in-flight: await same promise
  -> fetch GET /personal/client-info з X-Token
  -> parse тільки jars[]
  -> знайти jar.sendId === sendId
  -> якщо currencyCode === 980: map balance/goal to status
  -> cache status
  -> presenter renders safe aggregate status
```

## Money formatting

Тримати API values як minor units:

```text
currentMinor = jar.balance
goalMinor = jar.goal
```

Для UAH:

```text
123400 -> 1 234 грн
123456 -> 1 234,56 грн
```

Перед production release потрібен maintainer smoke test проти реальної Банки: порівняти rendered amount із Monobank UI. Не логувати full response під час перевірки.

## Fallback copy

Без token-а:

```text
Стан Банки видно за посиланням.
```

API тимчасово недоступний:

```text
Стан Банки тимчасово не вдалося оновити. Посилання працює.
```

Не використовувати pressure/FOMO copy:

```text
залишилось тільки
терміново
останній шанс
донесіть до цілі
```

## Security and privacy

- Не читати statement у цьому slice.
- Не вмикати webhook у цьому slice.
- Не persist-ити Monobank data в DB.
- Не зберігати donor identity або individual payment details.
- Не логувати `clientInfo.name`, `accounts`, `managedClients`, IBAN, masked PAN, webhook URL, permissions або full response.
- Допустимі тільки redacted status logs, наприклад `reason=jar-not-found sendIdSuffix=abc123`.

## Future task checklist

- [ ] Add config/env parsing for `MONOBANK_API_TOKEN`, TTL and timeout.
- [ ] Add `extractSupportJarSendId(...)` and tests.
- [ ] Add server-side Monobank client for `client-info` only.
- [ ] Add support status service with TTL cache and in-flight coalescing.
- [ ] Add UAH minor-unit formatter.
- [ ] Wire `/support` and homepage support block to optional live status.
- [ ] Keep calm fallback without `undefined`, debug JSON or broken links.
- [ ] Add focused tests with mocked fetch.
- [ ] Update `.env.example`, README, support docs and release surfaces only in the runtime PR.

## Acceptance criteria

- `/support` works with only `SUPPORT_JAR_URL` and no token.
- `/support` shows live current/goal when token works.
- Homepage support block can show the same aggregate status.
- No request happens more often than configured TTL.
- Stale cache is used if refresh fails.
- No statements/webhooks/scraping.
- No donor/payment storage.
- No gameplay reward or premium framing.
- Token never appears in logs, errors, UI, docs or snapshots.
- Existing gameplay `Бочка Пінного Міражу` remains untouched.
