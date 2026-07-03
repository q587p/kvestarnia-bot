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

Launcher створює `.env` з `.env.example`, якщо файла ще немає, готує ізольований runtime поза checkout-ом, запускає Prisma generate/migrate у цьому runtime і стартує там `npm run dev`.

### Isolated Windows local bot

Use `run-local-bot.cmd` for manual Telegram testing. It runs from a separate snapshot with independent `node_modules`, Prisma Client, and SQLite database, so development checks do not have to stop the bot. Use `refresh-local-bot.cmd` only when promoting a deliberate test checkpoint. See [`docs/LOCAL_BOT_RUNTIME.md`](LOCAL_BOT_RUNTIME.md).

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

Усі `/dev_*` команди мають лишатися non-production only: production feature flags можуть відкривати ігрові поверхні, але не мають реєструвати `/dev_*`, показувати їх у `/help` або `/dev_help`, чи дозволяти dev-only callback mutation. Зокрема `PARTY_SESSION_DEV_HELPERS_ENABLED` не повинен відкривати `/dev_party` у `NODE_ENV=production`.

Value-granting helper commands вмикаються тільки явним локальним opt-in:

```env
NODE_ENV=development
DEV_GRANT_COMMANDS_ENABLED=true
```

Вони працюють лише коли `NODE_ENV` не `production` **і** `DEV_GRANT_COMMANDS_ENABLED=true` / `1` / `yes` / `on`. Не вмикай `DEV_GRANT_COMMANDS_ENABLED` на hosted production: ці команди напряму змінюють рівень, XP, HP, ману, золото, манатки й локальний quest-progress.

- `/dev_help` — показує доступні локальні dev-команди з урахуванням enabled-прапорців.
- `/dev_reset_me` — скидає поточного персонажа.
- `/dev_party` — збирає тимчасову локальну ватагу для перевірки party/session і Big Barrel Brother flows; у production не реєструється й не показується навіть тоді, коли production party/raid feature flags увімкнені.
- `/dev_add_level [число]` — додає вказану кількість рівнів поточному персонажу; без числа додає 1 рівень.
- `/dev_add_xp [число]` — додає вказану кількість XP; без числа додає 1 XP.
- `/dev_add_gold [число]` — додає вказану кількість золота; без числа додає 1 золото.
- `/dev_heal [число]` — лікує поточного персонажа до максимуму, зокрема під час активного бою; з числом додає стільки HP, але не вище максимуму.
- `/dev_restore_mana [число]` — відновлює ману поточного персонажа до максимуму; з числом додає стільки мани, але не вище максимуму.
- `/dev_add_random_item [число]` — додає випадкові манатки; без числа додає одну.
- `/dev_add_bandage [число]` — додає бинти відповідальної паніки; без числа додає один бинт.
- `/dev_add_dense_bandage [число]` — додає щільні бинти; без числа додає один щільний бинт.
- `/dev_add_field_kit [число]` — додає польові аптечки; без числа додає одну аптечку.
- `/dev_add_yeger_line [число]` — додає єгерські риски на дощечці; без числа додає одну риску.
- `/dev_reset_yeger_bandage` — скидає таймер безкоштовного бинта Єгеря для поточного персонажа.
- `/dev_reset_yeger_trail` — завершує поточне очікування Єгерського сліду для поточного персонажа.
- `/dev_yeger_first_done` — доводить першу Єгерську дошку `Неспокійні справи` до `5/5` реальними terminal win rows; нагороду й досягнення треба забрати звичайною кнопкою здачі.
- `/dev_yeger_second_done` — доводить другу Єгерську дошку `Неспокійні справи 2.0` до `17/17` реальними terminal win rows після зданої першої дошки; нагороду й досягнення треба забрати звичайною кнопкою здачі.
- `/dev_adventure_reset` — скидає й перетасовує поточний вибір пригоди для швидкого локального тесту.
- `/dev_raid_stop` — достроково завершує активний pending-рейд на Бочку через звичайний reward path для швидкого локального тесту; якщо XP підняв рівень, показує звичайне окреме привітання.
- `/dev_raid_win` — у локальному Big Barrel Brother бою виставляє HP Старшого Брата Бочки в `0`; наступна дія або timeout проходить звичайний party-boss victory path.
- `/dev_reset_monster_rest` — скидає коротку перерву монстрів після серії ordinary боїв у Низі для швидкого локального `/fight` QA.
- `/dev_two_enemies` — стартує dev-only persistent бій проти двох ворогів для перевірки foundation multi-enemy state; production-маршрути лишаються одно-ворожими.

Ці команди не потрапляють у бокове меню Telegram і не показуються у звичайному `/help`. `/dev_help` показує dev-команди тільки тоді, коли їхні non-production gates реально enabled; за `DEV_GRANT_COMMANDS_ENABLED=true` у non-production основна клавіатура також показує кнопку `🧰 Адмінка` для цієї dev-довідки.

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

Це запускає lint, scripts typecheck, build і tests одним ланцюжком. `check` генерує Prisma Client один раз на початку, а standalone `npm run build` і `npm run typecheck` усе ще запускають `prisma generate` самі.

ESLint uses a content cache under `.cache/eslint/`; it is safe to delete `.cache/` when you need a cold local check.

Для docs-only зміни достатньо перевірити Markdown вручну. Якщо Codex або локальне середовище не запускали `npm run check`, у PR треба прямо написати: `Not run — docs-only change`.

## Scripts

- `npm run dev` — локальний bot polling через `ts-node-dev`; без `BOT_TOKEN` стартує тільки healthcheck server.
- `npm run build` — `prisma generate && npm run build:ts`.
- `npm run build:ts` — TypeScript build without Prisma generate; used inside `npm run check`.
- `npm start` — запуск `dist/bot.js`.
- `npm test` — Vitest suite без Telegram network calls.
- `npm run typecheck` — strict TypeScript with Prisma generate.
- `npm run typecheck:ts` — strict TypeScript without Prisma generate.
- `npm run lint` — ESLint для `src` і `tests`, with local cache under `.cache/eslint/`.
- `npm run lint:scripts` — ESLint for maintenance scripts, with local cache under `.cache/eslint/`.
- `npm run check` — PR-ready gate: Prisma generate, lint, scripts typecheck, build and tests.
- `npm run db:generate` — Prisma Client.
- `npm run db:validate` — перевірка Prisma schema.
- `npm run db:migrate` — локальні міграції Prisma.
- `npm run db:deploy` — застосування закомічених migrations для Render/CI; якщо Render уже має failed migration record для `0.0.25`, скрипт спершу безпечно розрулює цей known state, а потім продовжує deploy.
- `npm run maintenance:backfill-activity-events` — dry-run підтягування архівних `ActivityEvent` rows для хронік з поточного `DATABASE_URL`.
- `npm run maintenance:backfill-activity-events -- --apply` — застосувати підтягування після перевіреного dry-run.
- `npm run maintenance:poll-activity-events` — read-only перегляд останніх public `ActivityEvent` rows з поточного `DATABASE_URL`.
- `npm run maintenance:poll-activity-events -- --watch --interval=13` — polling нових activity rows без зміни БД.
- `npm run maintenance:repair-character-resources` — dry-run перевірка over-max `hpCurrent`/`manaCurrent` у таблиці `characters` для БД з поточного `DATABASE_URL`.
- `npm run maintenance:repair-character-resources -- --apply` — застосувати repair і clamp over-max ресурсів до поточних максимумів після перевіреного dry-run.

Recovery note for an already-failed Render DB after the fixed branch is deployed:

```bash
npx prisma migrate resolve --rolled-back 20260615140000_add_character_resource_regen_timestamps
npm run db:deploy
```

- `npm run db:studio` — Prisma Studio.

## Maintenance repair scripts

`npm run maintenance:backfill-activity-events` безпечний за замовчуванням: він лише рахує архівні public activity rows, які може створити для `📜 Хронік Квестарні`, і не змінює БД без `-- --apply`.

За замовчуванням скрипт бере останні 93 дні, як і player-facing retention хронік. Доступні опції:

```powershell
npm run maintenance:backfill-activity-events
npm run maintenance:backfill-activity-events -- --days=30
npm run maintenance:backfill-activity-events -- --since=2026-07-01
npm run maintenance:backfill-activity-events -- --batch-size=93
npm run maintenance:backfill-activity-events -- --all
npm run maintenance:backfill-activity-events -- --apply
```

Увага: для npm script прапори скрипта передаються після розділювача `--`. Команда `npm run maintenance:backfill-activity-events --apply` не застосує backfill і лишиться dry-run; потрібна форма `npm run maintenance:backfill-activity-events -- --apply`.

Backfill читає production source tables батчами, щоб не тримати весь архів у Node heap. Default batch size is `93`; for memory-constrained Render shells, keep the default or pass a smaller explicit value:

```bash
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:backfill-activity-events -- --batch-size=93
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:backfill-activity-events -- --batch-size=93 --apply
```

Типовий порядок запуску:

1. Переконайтесь, що процес читає правильний `DATABASE_URL`.
2. Запустіть dry-run без `--apply`.
3. Перевірте `planned`/`existing`/`invalid` counts.
4. Запустіть `-- --apply` тільки для перевіреної target-БД.
5. Перевірте результат read-only polling:

```powershell
npm run maintenance:backfill-activity-events
npm run maintenance:backfill-activity-events -- --apply
npm run maintenance:poll-activity-events -- --limit=13
```

На Windows той самий dry-run/apply/poll ланцюжок можна запустити інтерактивним helper-ом із паузами між кроками:

```powershell
backfill-activity-events.cmd
```

Для ізольованого local bot runtime helper сам наведе `DATABASE_URL` на runtime `prisma/dev.db`:

```powershell
backfill-activity-events.cmd --local-runtime
```

Якщо треба явно вказати іншу БД із Windows-середовища, наприклад production SQLite `DATABASE_URL`, передайте Prisma URL першим аргументом у лапках:

```powershell
backfill-activity-events.cmd "file:/var/data/kvestarnia.db"
```

У Render/Linux shell використовуйте bash-команди з явним `DATABASE_URL=...`, наведені нижче; `.cmd` призначений для Windows.

Для іншої локальної SQLite БД передайте `DATABASE_URL` у цьому ж PowerShell-сеансі:

```powershell
$env:DATABASE_URL="file:./prisma/dev.db"
npm run maintenance:backfill-activity-events
npm run maintenance:backfill-activity-events -- --apply
npm run maintenance:poll-activity-events -- --limit=13
```

Для ізольованого local bot runtime спершу візьміть його runtime path і наведіть `DATABASE_URL` саме на його `prisma/dev.db`, бо бот не читає checkout `.env` БД:

```powershell
$runtimePath = (node scripts\local-bot-runtime.cjs path --source-root (Get-Location)).Trim()
$runtimeDb = (Join-Path $runtimePath "prisma\dev.db").Replace("\", "/")
$env:DATABASE_URL = "file:$runtimeDb"
npm run maintenance:backfill-activity-events
npm run maintenance:backfill-activity-events -- --apply
npm run maintenance:poll-activity-events -- --limit=13
```

Скрипт відновлює лише події, які можна підтягнути без вигадування історії: створення персонажів, рівні з `character_achievements`, rare/epic манатки з поточного інвентаря та Big Barrel Brother victory sessions. `combat.underdog_won` не backfill-иться, бо архівні combat rows не гарантують точний рівень персонажа на момент бою.

`npm run maintenance:poll-activity-events` нічого не змінює в БД: він читає public `ActivityEvent` rows через той самий bounded feed query, який використовує runtime. Це швидка перевірка, чи хроніки вже мають нові рядки, або чи backfill/apply справді записав очікувані події.

Перед першим polling для БД, яка ще не має таблиці `ActivityEvent`, застосуйте committed migrations:

```powershell
npm run db:deploy
```

Для локальної dev-БД, де свідомо використовується Prisma dev workflow, можна натомість виконати:

```powershell
npm run db:migrate
```

```powershell
npm run maintenance:poll-activity-events
npm run maintenance:poll-activity-events -- --filter=imp --limit=13
npm run maintenance:poll-activity-events -- --filter=itm --json
npm run maintenance:poll-activity-events -- --watch --interval=13
```

Якщо polling показує `Rows: 0`, але в БД вже є персонажі або manatky, це означає, що сам `ActivityEvent` ledger ще порожній. Перевірте, що можна чесно реконструювати:

```powershell
npm run maintenance:backfill-activity-events
```

І тільки для правильної target-БД застосуйте dry-run результат:

```powershell
npm run maintenance:backfill-activity-events -- --apply
```

Фільтри відповідають runtime feed-фільтрам: `all`, `imp`, `adv`, `cmb`, `itm`. `--watch` повторює read-only polling і друкує тільки нові побачені rows; зупинка — `Ctrl+C`.

`npm run maintenance:repair-character-resources` безпечний за замовчуванням: він лише показує персонажів, у яких `hpCurrent > hpMax` або `manaCurrent > manaMax`, і не змінює БД без `-- --apply`.

Скрипт читає той `DATABASE_URL`, який активний для процесу. Для основного локального checkout-а це зазвичай `.env` з `DATABASE_URL=file:./dev.db`. Для ізольованого manual-test runtime передай точний шлях до його snapshot БД:

```powershell
$env:DATABASE_URL="file:$env:LOCALAPPDATA/Kvestarnia/local-bot/<snapshot>/prisma/dev.db"
npm run maintenance:repair-character-resources
```

Якщо dry-run показує очікувані рядки, застосуй repair тією самою змінною:

```powershell
npm run maintenance:repair-character-resources -- --apply
```

Цей скрипт виправляє тільки over-max HP/mana. Стара pending-продажа в `Шинку`, строк якої вже минув, не ремонтується скриптом: runtime-рівень має ігнорувати expired sale selections під час перевірки reserved manatky.

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

Якщо потрібно почистити вже зіпсовані ресурсні рядки у production SQLite, спочатку зупини bot процес або scale down сервіс, зроби backup persistent DB, запусти repair у dry-run, переглянь список рядків і лише після цього повтори з `--apply`:

```bash
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:repair-character-resources
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:repair-character-resources -- --apply
```

Для одноразового production backfill хронік після deploy спершу зроби backup persistent DB і dry-run:

```bash
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:backfill-activity-events
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:backfill-activity-events -- --batch-size=93 --apply
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:poll-activity-events
DATABASE_URL=file:/var/data/kvestarnia.db npm run maintenance:poll-activity-events -- --watch --interval=13
```

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
