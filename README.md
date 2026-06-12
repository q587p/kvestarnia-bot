# kvestarnia-bot

Квестарня - україномовна текстова Telegram RPG. Репозиторій містить TypeScript/Node.js foundation для Telegram-бота на grammY, Prisma/SQLite local baseline, Zod-validated content і перший Phase 1 зріз: ідемпотентний `/start` onboarding з вибором раси та класу.

## Що вже є

- CommonJS TypeScript scaffold у стилі sibling Telegram bot repo.
- `src/bot.ts` як локальний polling entrypoint.
- `/start` показує коротке вітання Квестарні, пропонує вибір раси й класу через callback-и та не створює дублікати персонажа при повторних натисканнях.
- `/hero`, `/profile`, `/me`, `/help` і кнопкове меню показують видимий прогрес без запуску повного gameplay loop.
- `/dev_reset_me` у локальному режимі скидає тільки вашого героя після підтвердження.
- Config layer із Zod для `BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`.
- Prisma schema та перша міграція для `User` і `Character`.
- Content tables для race/class/monster/item зі stable ids.
- Vitest tests для content validation, callback validation, starter stats, onboarding idempotency і shared utilities.

Повний gameplay loop, combat, inventory, loot, raids, guilds і PvP ще не реалізовані.

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

`BOT_TOKEN` у `.env` може бути порожнім для локальних перевірок. У такому режимі `npm run dev` валідовує конфіг і не запускає Telegram polling. Щоб запустити реального бота, додай токен від BotFather:

```env
BOT_TOKEN=replace-with-real-token
```

Не коміть `.env` або реальні секрети.

`npm run db:migrate` створить локальний файл `prisma/dev.db`, якщо його ще немає. Redis зараз не використовується runtime-кодом; `REDIS_URL` лишається placeholder-ом для майбутніх jobs/cache фіч.

Для перевірки перед PR використовуйте `npm run check`.

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
5. Натисніть кнопки `👤 Герой`, `🍺 До таверни`, `❔ Допомога`.
6. Для повторного тесту onboarding у локальному режимі виконайте `/dev_reset_me` і підтвердьте скидання.

`/dev_reset_me` працює тільки коли `NODE_ENV !== "production"` і видаляє лише персонажа поточного Telegram-користувача.

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

Наступний малий Phase 1 PR варто присвятити `/profile`: показати створеного персонажа з race/class, level, XP, gold, HP і mana без запуску combat/adventure loop.
