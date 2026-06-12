# kvestarnia-bot

Квестарня - україномовна текстова Telegram RPG. Репозиторій містить TypeScript/Node.js foundation для Telegram-бота на grammY, Prisma/SQLite local baseline, Zod-validated content і перші Phase 1 зрізи: ідемпотентний `/start` onboarding, малий таверновий рейд і першу пригоду з міміком-шаурмою.

## Що вже є

- CommonJS TypeScript scaffold у стилі sibling Telegram bot repo.
- `src/bot.ts` як локальний polling entrypoint.
- `/start` показує коротке вітання Квестарні, пропонує вибір раси й класу через callback-и та не створює дублікати персонажа при повторних натисканнях.
- `/hero`, `/profile`, `/me`, `/help` і кнопкове меню показують видимий прогрес без запуску повного gameplay loop.
- `/tavern` і `/raid` відкривають малий solo-рейд «П’ятничний рейд на Бочку Пінного Міражу» з винагородою раз на локальний день.
- `/adventure` і `/quest` відкривають першу коротку сцену «Перевірка підозрілої шаурми» з винагородою раз на збережену дату.
- `/fight` і `/hunt` відкривають першу безпечну сутичку «Сутичка з Міміком-шаурмою» з ідемпотентною винагородою раз на збережену дату.
- `/inventory` і `/guild` мають короткі заглушки, щоб Telegram-меню не вело в тишу.
- `/version` показує поточну версію бота, а `/news` читає останню новину й архів із `news.md`.
- XP rewards можуть підняти рівень героя за простими порогами прогресії.
- `/restart` видаляє поточного героя після підтвердження, щоб почати з початку через `/start`.
- `/dev_reset_me` у локальному режимі скидає тільки вашого героя після підтвердження.
- Config layer із Zod для `BOT_TOKEN`, `DATABASE_URL`, `NODE_ENV`.
- Prisma schema та перша міграція для `User` і `Character`.
- Content tables для race/class/monster/item зі stable ids.
- Vitest tests для content validation, callback validation, starter stats, onboarding idempotency і shared utilities.

Повний gameplay loop, combat, inventory, loot, групові raids, guilds і PvP ще не реалізовані.

## Вимоги

- Node.js 20 або новіший.
- npm.
- SQLite через Prisma `file:./dev.db` у `DATABASE_URL`.

У Windows PowerShell може блокуватися `npm.ps1`; тоді використовуй `npm.cmd`, наприклад `npm.cmd run build`.

## Local Setup

Quick Windows launcher:

```cmd
run-local-bot.cmd
```

The launcher creates `.env` from `.env.example` if needed, installs dependencies when `node_modules` is missing, runs Prisma generate/migrate, then starts `npm run dev`.

Manual setup:

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

У Windows PowerShell замість `cp`:

```powershell
Copy-Item .env.example .env
```

`BOT_TOKEN` у `.env` може бути порожнім для локальних перевірок. У такому режимі `npm run dev` валідовує конфіг, запускає тільки healthcheck HTTP server і не запускає Telegram polling. Щоб запустити реального бота, додай токен від BotFather:

```env
BOT_TOKEN=replace-with-real-token
```

Не коміть `.env` або реальні секрети.

Minimal local `.env`:

```env
BOT_TOKEN=replace-with-real-token
DATABASE_URL=file:./dev.db
```

`npm run db:migrate` створить локальний файл `prisma/dev.db`, якщо його ще немає. Redis зараз не використовується runtime-кодом і не потрібен для мінімального локального запуску.

Для перевірки перед PR використовуйте `npm run check`.

## Render Setup

Квестарня поки працює як Telegram polling bot, але для Render використовується Web Service, бо SQLite database file має жити на Persistent Disk. HTTP port у цьому режимі не є webhook-ом: це маленький healthcheck server, щоб Render бачив відкритий порт і міг вважати сервіс живим.

Minimal Render environment variables:

```env
BOT_TOKEN=replace-with-real-token
DATABASE_URL=file:/var/data/kvestarnia.db
NODE_ENV=production
NODE_VERSION=22
# Optional: send known users one update message per deployed version.
DEPLOY_NOTIFICATIONS_ENABLED=false
```

Render сам передає `PORT`; якщо його немає, healthcheck server слухає `10000` на `0.0.0.0`. SQLite файл має лежати на Persistent Disk, змонтованому в `/var/data`, інакше дані можуть зникати між деплоями.

Render build command:

```bash
npm install && npm run build
```

Render start command:

```bash
npm run db:deploy && npm run start
```

`REDIS_URL` is not required for the current SQLite/Render deployment. Add Redis only when a feature actually uses jobs, cache, or cooldown storage.

Set `DEPLOY_NOTIFICATIONS_ENABLED=true` only when deployed users should receive a short Telegram message after a new version starts. The bot deduplicates this by a marker file on the same Persistent Disk as SQLite.

Healthcheck endpoints:

```text
GET /
GET /health
```

## Prisma

Згенерувати Prisma Client:

```bash
npx prisma generate
```

Перевірити schema:

```bash
npx prisma validate
```

Застосувати першу міграцію до локальної SQLite БД:

```bash
npx prisma migrate dev
```

Ті самі дії доступні через npm scripts:

```bash
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:deploy
npm run db:studio
```

## Local Playthrough

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run dev
```

Після старту бота:

1. Напишіть `/start` у Telegram.
2. Оберіть звертання, расу й клас кнопками.
3. Підтвердьте героя на фінальному екрані.
4. Перевірте героя через `/hero`, `/profile` або `/me`.
5. Відкрийте `/tavern` або натисніть `🍺 До таверни`.
6. Натисніть `🍺 У рейд на бочку`.
7. Відкрийте `/adventure` або `/quest`.
8. Оберіть одну дію проти `Міміка-шаурми`: тицьнути, попросити чек або відступити.
9. Відкрийте `/fight` або `/hunt`.
10. Оберіть одну дію в «Сутичці з Міміком-шаурмою»: вдарити, збити з пантелику чеком або відступити красиво.
11. Перевірте `/hero`: XP, золото й рівень мають показати новий прогрес.
12. Перевірте `/version` і `/news`, щоб побачити поточну версію, останню новину й архів.
13. Натисніть той самий рейд, пригоду або сутичку ще раз і переконайтесь, що винагорода не дублюється.
14. Щоб почати героя з початку, виконайте `/restart` і підтвердьте видалення.
15. Для локальних dev-перевірок також доступний `/dev_reset_me`.

`/fight` і `/hunt` зараз є combat probe: коротка безпечна перевірка кнопок, винагород і прогресу, а не повний покроковий бойовий рушій. HP після сутички поки не зберігається.

`/dev_reset_me` працює тільки коли `NODE_ENV !== "production"` і видаляє лише персонажа поточного Telegram-користувача.
`/restart` доступний як звичайна команда, але теж видаляє лише персонажа поточного Telegram-користувача й потребує підтвердження кнопкою.

`User.telegramUserId` зберігається як `BigInt` і мапиться у БД на `telegram_user_id`, як у `docs/TECHNICAL_PLAN.md`. На межі Telegram/DB треба конвертувати `ctx.from.id` у `BigInt`; доменний код не має знати про Telegram payload.

## Scripts

- `npm run dev` - локальний bot polling через `ts-node-dev`.
- `npm run build` - `prisma generate && tsc`.
- `npm start` - запуск `dist/bot.js`.
- `npm test` - Vitest suite без Telegram network calls.
- `npm run typecheck` - strict TypeScript.
- `npm run lint` - ESLint для `src` і `tests`.
- `npm run check` - lint, typecheck, build і tests одним ланцюжком.
- `npm run db:generate` - Prisma Client.
- `npm run db:validate` - перевірка Prisma schema.
- `npm run db:migrate` - локальні міграції Prisma.
- `npm run db:deploy` - застосування закомічених Prisma migrations для Render/CI.
- `npm run db:studio` - Prisma Studio.

## Структура

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

Domain-код не має імпортувати Telegram/grammY. Bot layer має лишатися тонким.

## Корисні документи

- `CHANGELOG.md`
- `news.md`
- `AGENTS.md`
- `docs/BRAND.md`
- `docs/CHARACTER_CREATION.md`
- `docs/PRODUCT_BRIEF.md`
- `docs/GAME_DESIGN.md`
- `docs/TECHNICAL_PLAN.md`
- `docs/ROADMAP.md`
- `docs/CONTENT_STYLE_GUIDE.md`
- `docs/BALANCE_NOTES.md`
- `docs/SECURITY_AND_FAIR_PLAY.md`
- `docs/CODEX_WORKFLOW.md`

## Наступний крок

Наступний малий Phase 1 PR варто присвятити першим persistent combat states або покращенню таймінгу daily actions під Europe/Kyiv.
