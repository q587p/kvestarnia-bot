# kvestarnia-bot

Квестарня - україномовна текстова Telegram RPG. Репозиторій містить TypeScript/Node.js foundation для Telegram-бота на grammY, Prisma/PostgreSQL baseline, Zod-validated content і перший Phase 1 зріз: ідемпотентний `/start` onboarding з вибором раси та класу.

## Що вже є

- CommonJS TypeScript scaffold у стилі sibling Telegram bot repo.
- `src/bot.ts` як локальний polling entrypoint.
- `/start` показує коротке вітання Квестарні, пропонує вибір раси й класу через callback-и та не створює дублікати персонажа при повторних натисканнях.
- Config layer із Zod для `BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`.
- Prisma schema та перша міграція для `User` і `Character`.
- Content tables для race/class/monster/item зі stable ids.
- Vitest tests для content validation, callback validation, starter stats, onboarding idempotency і shared utilities.
- Docker Compose для PostgreSQL і Redis.

Повний gameplay loop, combat, inventory, loot, raids, guilds і PvP ще не реалізовані.

## Вимоги

- Node.js 20 або новіший.
- npm.
- Docker або сумісний Docker Compose для локальних Postgres/Redis.

У Windows PowerShell може блокуватися `npm.ps1`; тоді використовуй `npm.cmd`, наприклад `npm.cmd run build`.

## Local Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npx prisma generate
npx prisma migrate dev
npm run typecheck
npm test
npm run build
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

## Prisma

Згенерувати Prisma Client:

```bash
npx prisma generate
```

Перевірити schema:

```bash
npx prisma validate
```

Застосувати першу міграцію до локальної Postgres БД:

```bash
npx prisma migrate dev
```

`User.telegramUserId` зберігається як `BigInt` і мапиться у БД на `telegram_user_id`, як у `docs/TECHNICAL_PLAN.md`. На межі Telegram/DB треба конвертувати `ctx.from.id` у `BigInt`; доменний код не має знати про Telegram payload.

## Scripts

- `npm run dev` - локальний bot polling через `ts-node-dev`.
- `npm run build` - `prisma generate && tsc`.
- `npm start` - запуск `dist/bot.js`.
- `npm test` - Vitest suite без Telegram network calls.
- `npm run typecheck` - strict TypeScript.
- `npm run lint` - ESLint для `src` і `tests`.

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

- `AGENTS.md`
- `docs/BRAND.md`
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
