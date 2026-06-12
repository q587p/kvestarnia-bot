# kvestarnia-bot

Квестарня — україномовна текстова Telegram RPG. Репозиторій зараз містить Phase 0 foundation: TypeScript/Node.js, npm workflow, мінімальний grammY bot entrypoint, Prisma/PostgreSQL foundation, Zod-validated content і базові тести.

## Що вже є

- CommonJS TypeScript scaffold у стилі sibling Telegram bot repo.
- `src/bot.ts` як мінімальний polling entrypoint.
- `/start` з короткою українською заглушкою без gameplay.
- Config layer із Zod для `BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `NODE_ENV`.
- Prisma schema з мінімальними `User` і `Character`.
- Content tables для race/class/monster/item зі stable ids.
- Vitest tests для content validation, unique ids і fake RNG.
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
npm run typecheck
npm test
npm run build
npm run dev
```

У Windows PowerShell замість `cp`:

```powershell
Copy-Item .env.example .env
```

`BOT_TOKEN` у `.env` може бути порожнім для foundation-перевірок. У такому режимі `npm run dev` валідовує конфіг і не запускає Telegram polling. Щоб запустити реального бота, додай токен від BotFather:

```env
BOT_TOKEN=replace-with-real-token
```

Не коміть `.env` або реальні секрети.

## Prisma

Згенерувати Prisma Client:

```bash
npx prisma generate
```

Створити першу локальну міграцію після старту Postgres:

```bash
npx prisma migrate dev --name init
```

Міграція не додана в цьому scaffold-коміті навмисно: Phase 0 фіксує мінімальну schema contract, а застосування міграцій залежить від локальної Postgres БД. Наступний DB-крок має додати першу міграцію окремо й перевірити її проти `docker-compose.yml`.

## Scripts

- `npm run dev` — локальний bot polling через `ts-node-dev`.
- `npm run build` — `prisma generate && tsc`.
- `npm start` — запуск `dist/bot.js`.
- `npm test` — Vitest suite без Telegram network calls.
- `npm run typecheck` — strict TypeScript.
- `npm run lint` — ESLint для `src` і `tests`.

## Структура

```text
src/
  bot.ts
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

Phase 1 варто починати з `/start` onboarding: вибір раси й класу через callback-и, idempotent character creation, перша Prisma migration і тести без Telegram network calls.
