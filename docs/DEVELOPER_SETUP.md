# Developer Setup

Цей документ тримає технічний runbook, який не має перевантажувати публічний README. README продає Квестарню; цей файл допомагає запустити, перевірити й задеплоїти бот.

## Вимоги

- Node.js 20 або новіший.
- npm.
- SQLite через Prisma `DATABASE_URL=file:./dev.db` для локального запуску.
- Telegram bot token від BotFather потрібен тільки для реального polling-бота. Без токена можна запускати foundation checks і healthcheck server.

На Windows PowerShell іноді блокує `npm.ps1`. У такому разі використовуй `npm.cmd`, наприклад:

```cmd
npm.cmd run build
```

## Швидкий локальний запуск на Windows

```cmd
run-local-bot.cmd
```

Launcher створює `.env` з `.env.example`, якщо файла ще немає, встановлює залежності, коли відсутній `node_modules`, запускає Prisma generate/migrate і стартує `npm run dev`.

## Ручний локальний запуск

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Для Windows PowerShell замість `cp`:

```powershell
Copy-Item .env.example .env
```

Мінімальний локальний `.env`:

```env
NODE_ENV=development
BOT_TOKEN=
BOT_USERNAME=
DATABASE_URL=file:./dev.db
DEPLOY_NOTIFICATIONS_ENABLED=false
DEV_GRANT_COMMANDS_ENABLED=false
# SUPPORT_JAR_URL=https://send.monobank.ua/jar/<real-jar-id>
# SUPPORT_JAR_CURRENT_UAH=0
# SUPPORT_JAR_GOAL_UAH=5000
# SUPPORT_JAR_STATUS_UPDATED_AT=2026-06-16
```

`BOT_TOKEN` може бути порожнім для локальних перевірок без реального Telegram polling. У цьому режимі бот валідовує конфіг і запускає HTTP healthcheck server, але не під’єднується до Telegram API.

`BOT_USERNAME` optional. Якщо він заданий, `/duel` invite links генеруються як `https://t.me/<BOT_USERNAME>?start=duel_<token>`. Тримай dev/prod ботів окремо: локально можна ставити `kvestarnia_dev_bot`, production має використовувати реальний `kvestarnia_bot`. Значення пишеться без `@`.

`SUPPORT_JAR_URL` optional. Якщо він заданий, це має бути absolute `https://send.monobank.ua/jar/...` без URL credentials; без нього `/support` і public site не показують битих support-link-ів.

`SUPPORT_JAR_CURRENT_UAH`, `SUPPORT_JAR_GOAL_UAH` і `SUPPORT_JAR_STATUS_UPDATED_AT` optional та ручні. Вони лише показують спокійний read-only стан Банки в `/support` і на public site; це не payment confirmation і не donor state. Дата статусу має бути короткою `YYYY-MM-DD`.

Support Jar setup lives in `docs/SUPPORT_JAR_BACKLOG.md`; note that the Monobank reward URL and `SUPPORT_JAR_URL` are different links. Do not put `https://t.me/kvestarnia_bot?start=support_thanks` into `SUPPORT_JAR_URL`.

Щоб запустити реального бота, додай токен:

```env
BOT_TOKEN=replace-with-real-token
BOT_USERNAME=kvestarnia_bot
```

Не коміть `.env`, реальні токени, приватні `chat_id` або будь-які секрети.

## Локальні dev-команди

`/dev_reset_me` лишається локальним reset-хелпером і працює, коли `NODE_ENV` не `production`.

Value-granting helper commands вмикаються тільки явним локальним opt-in:

```env
NODE_ENV=development
DEV_GRANT_COMMANDS_ENABLED=true
```

Вони працюють лише коли `NODE_ENV` не `production` **і** `DEV_GRANT_COMMANDS_ENABLED=true` / `1` / `yes` / `on`. Не вмикай `DEV_GRANT_COMMANDS_ENABLED` на hosted production: ці команди напряму змінюють рівень, XP, HP, ману, золото й манатки.

- `/dev_reset_me` — скидає поточного персонажа.
- `/dev_add_level` — додає 1 рівень поточному персонажу.
- `/dev_add_xp [число]` — додає вказану кількість XP; без числа додає 1 XP.
- `/dev_add_gold [число]` — додає вказану кількість золота; без числа додає 1 золото.
- `/dev_heal [число]` — лікує поточного персонажа до максимуму; з числом додає стільки HP, але не вище максимуму.
- `/dev_restore_mana [число]` — відновлює ману поточного персонажа до максимуму; з числом додає стільки мани, але не вище максимуму.
- `/dev_add_random_item [число]` — додає випадкові манатки; без числа додає одну.
- `/dev_adventure_reset` — скидає й перетасовує поточний вибір пригоди для швидкого локального тесту.

Ці команди не потрапляють у бокове меню Telegram. `/help` показує value-granting dev-команди тільки тоді, коли вони реально enabled.

## Prisma

Типовий цикл для локальної БД:

```bash
npm run db:generate
npm run db:validate
npm run db:migrate
```

Окремі команди:

```bash
npx prisma generate
npx prisma validate
npx prisma migrate dev
```

`npm run db:migrate` створює локальний SQLite файл `prisma/dev.db`, якщо його ще немає.

Для hosted/CI deployment використовуй закомічені міграції:

```bash
npm run db:deploy
```

Prisma Studio:

```bash
npm run db:studio
```

## Перевірка перед PR

Для звичайної зміни:

```bash
npm run check
```

Це запускає lint, typecheck, build і tests одним ланцюжком.

Для docs-only зміни достатньо перевірити Markdown вручну. Якщо Codex або локальне середовище не запускали `npm run check`, у PR треба прямо написати: `Not run — docs-only change`.

## Scripts

- `npm run dev` — локальний bot polling через `ts-node-dev`; без `BOT_TOKEN` стартує тільки healthcheck server.
- `npm run build` — `prisma generate && tsc`.
- `npm start` — запуск `dist/bot.js`.
- `npm test` — Vitest suite без Telegram network calls.
- `npm run typecheck` — strict TypeScript.
- `npm run lint` — ESLint для `src` і `tests`.
- `npm run check` — lint, typecheck, build і tests.
- `npm run db:generate` — Prisma Client.
- `npm run db:validate` — перевірка Prisma schema.
- `npm run db:migrate` — локальні міграції Prisma.
- `npm run db:deploy` — застосування закомічених migrations для Render/CI; якщо Render уже має failed migration record для `0.0.25`, скрипт спершу безпечно розрулює цей known state, а потім продовжує deploy.

Recovery note for an already-failed Render DB after the fixed branch is deployed:

```bash
npx prisma migrate resolve --rolled-back 20260615140000_add_character_resource_regen_timestamps
npm run db:deploy
```

- `npm run db:studio` — Prisma Studio.

## Render setup

Квестарня поки працює як Telegram polling bot. На Render використовується Web Service, бо SQLite database file має жити на Persistent Disk. HTTP port у цьому режимі не є webhook-ом; це маленький healthcheck server, щоб Render бачив живий процес.

Мінімальні Render environment variables:

```env
BOT_TOKEN=replace-with-real-token
DATABASE_URL=file:/var/data/kvestarnia.db
NODE_ENV=production
NODE_VERSION=22
DEPLOY_NOTIFICATIONS_ENABLED=false
```

Render сам передає `PORT`. Якщо `PORT` немає, healthcheck server слухає `10000` на `0.0.0.0`.

SQLite файл має лежати на Persistent Disk, змонтованому в `/var/data`. Без persistent disk дані можуть зникати між деплоями.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run db:deploy && npm run start
```

`REDIS_URL` зараз не потрібен для runtime-коду. Redis варто додавати тільки тоді, коли конкретна фіча реально використовує jobs, cache або cooldown storage.

`DEPLOY_NOTIFICATIONS_ENABLED=true` вмикай тільки тоді, коли відомі користувачі мають отримати коротке Telegram-повідомлення після старту нової версії. Бот дедуплікує це marker-файлом на тому самому Persistent Disk, що й SQLite.

## Healthcheck і public endpoints

```text
GET /      public Ukrainian Kvestarnia site
GET /health Render healthcheck, text/plain `kvestarnia ok`
```

```text
GET /presence Жива Квестарня public presence page
GET /api/presence/locations public presence JSON
GET /news public news archive rendered from news.md
```

`/presence` показує «Живу Квестарню» з розкладом за відкритими місцинами. Блок присутности на `/` лишає тільки загальні лічильники. Обидві поверхні працюють без точних timestamp-ів, без публічних імен гравців за замовчуванням і без публічних назв прихованих локацій.

## Структура коду

```text
src/
  bot.ts
  bot/callbacks/
  bot/keyboards/
  bot/presenters/
  config/
  content/
  db/
  domain/
  jobs/
  services/
  shared/
prisma/
tests/
```

Правило архітектури: domain-код не імпортує Telegram або grammY. Bot layer має лишатися тонким адаптером, а ігрова логіка — тестованою через звичайні об’єкти.

## Troubleshooting

### `npm.ps1 cannot be loaded`

Використай `npm.cmd` замість `npm` у PowerShell або запусти команди в `cmd.exe`.

### Бот не polling-иться в Telegram

Перевір, що в `.env` є реальний `BOT_TOKEN`. Порожній токен — валідний режим для локальних foundation checks, але не для реальної гри.

### Prisma не бачить БД

Перевір `DATABASE_URL`. Для локальної SQLite БД очікуване значення:

```env
DATABASE_URL=file:./dev.db
```

Потім запусти:

```bash
npm run db:generate
npm run db:migrate
```

### Render стартує, але прогрес зникає

Перевір, що SQLite файл лежить на Persistent Disk, а `DATABASE_URL` вказує на `/var/data/kvestarnia.db` або інший шлях усередині змонтованого persistent volume.
