# Банка підтримки Квестарні

Цей документ фіксує добровільну підтримку Квестарні через Monobank-банку. З `0.1.1` перший безпечний runtime-slice вже існує: optional `SUPPORT_JAR_URL`, вторинна команда `/support`, сайтова secondary-картка за наявности URL і deep link `/start support_thanks`.

Це все ще не payment integration: бот не підтверджує оплату, не зберігає donor state і не видає ігрових нагород.

## Quick setup: which URL goes where

Є два різні посилання:

| Purpose | Where to put it | Value |
|---|---|---|
| Bot gratitude deep link | Monobank jar reward / thank-you URL field | `https://t.me/kvestarnia_bot?start=support_thanks` |
| Public jar link | Deployment env `SUPPORT_JAR_URL` | `https://send.monobank.ua/jar/<real-jar-id>` |

Do not swap them. Telegram deep link goes into Monobank reward settings; public Monobank jar link goes into the app environment.

## Monobank jar setup checklist

1. Create a Monobank jar.
2. Jar name: `Банка Квестарні`.
3. Minimum amount, if configured: `50 грн`.
4. Reward / thank-you URL in Monobank: `https://t.me/kvestarnia_bot?start=support_thanks`.
5. Copy the public jar link from Monobank. It should look like `https://send.monobank.ua/jar/...`.
6. Put that public jar link into deployment env as `SUPPORT_JAR_URL`.
7. Restart/redeploy the app.
8. Check `/support` and the homepage.

Do not put the Telegram deep link into `SUPPORT_JAR_URL`. Do not hardcode the real Monobank jar URL in code, docs or README.

`/start support_thanks` only shows cosmetic gratitude. It does not confirm payment and does not grant XP, gold, loot, manatky, levels, titles, rankings, or access.

## Product rule

Банка підтримки — це не магазин, не преміум і не монетизація сили.

Підтримка не має давати:

- XP;
- золото;
- предмети або манатки;
- екіпірування;
- бойову силу;
- прогрес;
- місце в ігрових рейтингах;
- доступ до фіч;
- будь-яку перевагу над іншими гравцями.

Можна давати тільки:

- статичну сцену подяки;
- косметичну корчмарську сцену подяки;
- жартову цифру `✨ +1000 до настрою корчми`, яка ніде не зберігається й не впливає на гру.

## Naming

Назовні:

```text
Банка підтримки Квестарні
```

Коротка назва для Monobank, якщо діє ліміт символів:

```text
Банка Квестарні
```

Пояснення різниці:

```text
У Monobank вона зветься коротше — «Банка Квестарні», бо навіть корчмар не переміг ліміт символів.
```

Не використовувати:

- назву через «бочку» для support-фічі;
- коротку назву Monobank-банки через «бочку»;
- `донатери отримують бонуси`;
- `купити лут`;
- `преміум`;
- `ексклюзивна нагорода`;
- `реальні гроші → золото/XP/манатки`;
- `благодійний збір`, якщо юридично це не благодійний збір.

## Monobank configuration

Рекомендована конфігурація, коли буде створюватися банка:

- Назва банки: `Банка Квестарні`.
- Мінімальна сума: `50 грн`.
- Посилання на нагороду: `https://t.me/kvestarnia_bot?start=support_thanks`.

Текст нагороди:

```text
🍺 Корчмар піднімає подячний кухоль.
✨ +1000 до настрою корчми.
Ефект косметичний, ігрових переваг не дає, але корчмі стало тепліше.
```

Коротший варіянт:

```text
🍺 Дякуємо за підтримку Квестарні!
✨ +1000 до настрою корчми.
Без ігрових переваг — тільки вдячність і тепліша корчма.
```

Important: reward link does not confirm payment. Його можна переслати, тому бот не має писати «платіж підтверджено» і не має видавати ігрових сутностей.

## Runtime scope in `0.1.1`

### Optional config

Env/config:

```env
SUPPORT_JAR_URL=https://send.monobank.ua/jar/...
SUPPORT_JAR_CURRENT_UAH=1234
SUPPORT_JAR_GOAL_UAH=5000
SUPPORT_JAR_STATUS_UPDATED_AT=2026-06-16
```

Rules:

- якщо `SUPPORT_JAR_URL` заданий — можна показувати кнопку/лінк підтримки;
- якщо не заданий — не рендерити `undefined`, `null`, порожній або битий URL;
- URL має бути absolute `https://send.monobank.ua/jar/...` без URL credentials;
- `SUPPORT_JAR_URL` має бути саме public Monobank jar link, не Telegram reward deep link;
- `SUPPORT_JAR_CURRENT_UAH`, якщо заданий, має бути non-negative integer;
- `SUPPORT_JAR_GOAL_UAH`, якщо заданий, має бути positive integer;
- `SUPPORT_JAR_STATUS_UPDATED_AT`, якщо заданий, має бути короткою датою `YYYY-MM-DD`;
- status fields є ручним read-only display, не payment integration і не donor state;
- не хардкодити вигаданий Monobank URL у коді чи README.

Якщо URL є, а сума не налаштована, `/support` і public site можуть показати спокійне `Стан Банки видно за посиланням.` без вигаданої суми.

Якщо сума налаштована:

```text
У Банці зараз: 1 234 грн
Ціль: 5 000 грн
Оновлено вручну: 2026-06-16
```

Не писати pressure/FOMO copy на кшталт `залишилось тільки`, `терміново`, `останній шанс` або `донесіть до цілі`.

### Bot command `/support`

Команда має бути вторинною і добровільною:

- не додавати в welcome message;
- не робити головним CTA гри;
- можна додати в службовий блок `/help`;
- у command catalog краще `includeInMenu: false`, якщо така опція існує.

Текст із URL:

```text
🫙 Банка підтримки Квестарні

Квестарня безкоштовна: жодної купівлі сили, луту, золота чи прогресу.

Якщо хочете підтримати розробку — можна добровільно підкинути монет у Банку. Вона допомагає оплачувати сервер, токени для Кодексу, тексти, редактуру, коректуру й інші речі, через які корчма не розвалюється між оновленнями.

Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.

Підтримати: <URL>
```

Fallback без URL:

```text
🫙 Банка підтримки Квестарні

Корчмар уже поставив Банку на стійку, але посилання ще прибивають до дошки.

Квестарня безкоштовна й не продає силу, лут або прогрес. Коли Банка відчиниться, тут буде добровільне посилання для підтримки сервера, текстів і корчмарської інфраструктури.

Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.
```

### Deep link `support_thanks`

Monobank reward link may point to:

```text
https://t.me/kvestarnia_bot?start=support_thanks
```

Scene copy:

```text
🍺 Корчмар піднімає подячний кухоль.

Якщо ви тут після поповнення Банки Квестарні — дякуємо. Ваш внесок допомагає тримати корчму живою: сервер, токени для Кодексу, тексти, редактура, коректура й інші речі, які корчмар називає «та воно саме працює».

Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч.

✨ <b>+1000 до настрою корчми</b>

Ефект косметичний. Піна справжня настільки, наскільки це дозволяє Telegram.
```

Deep link must not:

- confirm payment;
- store donor state;
- grant XP, gold, items, equipment, rankings or access;
- mutate character progression.

### Public site block

If `SUPPORT_JAR_URL` exists, the homepage shows a secondary block below gameplay/news context, not in the hero:

```text
🫙 Підтримати Квестарню

Квестарня безкоштовна й без купівлі ігрової сили.

Якщо хочеться допомогти проєкту — можна добровільно підкинути монет у Банку підтримки: на сервер, токени для Кодексу, тексти, редактуру, коректуру, ілюстрації й корчмарську інфраструктуру.

Підтримка не дає XP, золота, луту, манаток, рівнів, бойової сили, прогресу або доступу до фіч. Просто корчмі стане трохи тепліше.
```

CTA:

```text
Підтримати корчму
```

If URL is absent, do not show a broken link.

### Future live status

Live read-only status may be considered only as a separate PR after checking official Monobank API docs, token scopes, rate limits, caching, privacy and logging boundaries. Canonical future plan: [SUPPORT_JAR_LIVE_STATUS.md](SUPPORT_JAR_LIVE_STATUS.md).

Rules for any future live integration:

- server-side only;
- cache results and avoid polling on every `/support` request;
- never expose API tokens;
- never log payment details, donor names, comments, cards or any individual payment data;
- never confirm individual payments in Telegram;
- keep support cosmetic-only with no XP, gold, loot, manatky, levels, ranks, titles, feature access or gameplay advantage.

Scraping `send.monobank.ua` pages is not allowed unless the maintainer explicitly approves it later. Prefer official APIs or manual runtime config.

### README section

README may mention `/support`, voluntary support and runtime-configured URL, but must not hardcode a real Monobank URL:

```md
## 🫙 Підтримати Квестарню

Квестарня безкоштовна й не продає бойову силу, прогрес або лут.

Але можна добровільно підтримати розробку: сервер, інструменти, токени для Кодексу, редактура, коректура, тексти, ілюстрації й майбутні візуальні матеріали.

У боті: `/support`
```

## Acceptance checklist

- `/support` exists and is secondary.
- `/support` renders URL only when configured.
- `/support` fallback does not show a broken URL.
- `/start` without parameters works as before.
- `/start support_thanks` shows gratitude scene.
- `/start support_thanks` does not confirm payment.
- `/start support_thanks` does not grant or mutate XP, gold, items, equipment, character progression, ratings or donor state.
- Homepage support block is secondary and does not compete with `Грати в Telegram`.
- README/docs do not invent a real Monobank URL.
- Tests cover configured URL, missing URL, `support_thanks`, no gameplay rewards and unchanged regular `/start`.
- `npm.cmd run check` passes.
