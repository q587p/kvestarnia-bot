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

Use `run-local-bot.cmd` for manual Telegram testing. It runs from a separate snapshot with independent `node_modules`, Prisma Client, and SQLite database, so development checks do not have to stop the bot. Use `refresh-local-bot.cmd` only when promoting a deliberate test checkpoint. See [`docs/operations/local-bot-runtime.md`](./local-bot-runtime.md).

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
HP_RECOVERY_NOTIFICATIONS_ENABLED=false
DEV_GRANT_COMMANDS_ENABLED=false
FIGHTING_CORNER_ONBOARDING_QUEST_ENABLED=false
FIGHTING_CORNER_ONBOARDING_QUEST_DEV_HELPERS_ENABLED=false
# SUPPORT_JAR_URL=https://send.monobank.ua/jar/<real-jar-id>
# SUPPORT_JAR_CURRENT_UAH=0
# SUPPORT_JAR_GOAL_UAH=5000
# SUPPORT_JAR_STATUS_UPDATED_AT=2026-06-16
```

### HP recovery notification rollout

Keep `HP_RECOVERY_NOTIFICATIONS_ENABLED=false` for deploy and migration. Before any production enablement:

1. Stop or snapshot the source database through the normal production backup procedure. Copy that backup into an isolated workspace; never point these commands at the mounted live database. The following PowerShell sequence must show 44 completed migrations before deploy and 45 afterward:

   ```powershell
   $source = Resolve-Path 'C:\backups\kvestarnia-before-hp-recovery.db'
   $qa = Join-Path (Get-Location) '.tmp-hp-recovery-production-copy.db'
   Copy-Item -LiteralPath $source -Destination $qa
   sqlite3.exe $qa "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"
   $env:DATABASE_URL = 'file:' + ($qa.Replace('\', '/'))
   npx.cmd prisma migrate status
   npx.cmd prisma migrate deploy
   npx.cmd prisma migrate status
   sqlite3.exe $qa ".read scripts/explain-hp-recovery-candidates.sql"
   ```

   The final read-only SQL script must report 45 completed migrations, the three queue indexes, four fixed index-backed candidate branches, and no `MULTI-INDEX OR`. It sets `PRAGMA query_only=ON` before the schema smoke and `EXPLAIN`. Repository integration tests use temporary handcrafted SQLite schemas and are separate automated evidence; they do not validate this restored production-shaped copy.
2. Run `npx.cmd prisma validate` in the checkout. Refresh the isolated local bot with the flag enabled, run `/dev_hp_recovery_due`, and verify the task-doc scenarios with a maintainer test account. This QA is a maintainer step; a passing automated suite is not a claim that Telegram QA happened.
3. Enable one controlled production window. Watch only aggregate scheduler logs: tick duration and due/claimed/sent/retried/suppressed/error counts. Logs must not include Telegram ids or player data.
4. Abort and turn the flag off on any duplicate notice, any three consecutive ticks with `errors > 0`, or any three consecutive ticks with `due = 13`. This conservative saturation signal needs no unbounded `COUNT(*)` or backlog scan. Flag-off stops both producers and the scheduler; it does not scan or mutate the queue.
5. Re-enable only after diagnosing the aggregate signal. Nonterminal rows with no queue progress for more than 24 hours are suppressed when they next become due, so days-old work cannot send after a later re-enable. Ambiguous stale `sending` rows are suppressed and never resent.

Rollback is flag-only after the additive migration: keep the schema in place, set `HP_RECOVERY_NOTIFICATIONS_ENABLED=false`, restart normally, and leave stale-row handling to the bounded due path.

`BOT_TOKEN` може бути порожнім для локальних перевірок без реального Telegram polling. У цьому режимі бот валідовує конфіг і запускає HTTP healthcheck server, але не під’єднується до Telegram API.

`BOT_USERNAME` optional. Якщо він заданий, `/duel` invite links генеруються як `https://t.me/<BOT_USERNAME>?start=duel_<token>`. Тримай dev/prod ботів окремо: локально можна ставити `kvestarnia_dev_bot`, production має використовувати реальний `kvestarnia_bot`. Значення пишеться без `@`.

`FIGHTING_CORNER_ONBOARDING_QUEST_ENABLED` окремо відкриває production-поверхню справи `Перше правило Бійцівського кутка`; до цільової runtime-перевірки лишай його `false`. `FIGHTING_CORNER_ONBOARDING_QUEST_DEV_HELPERS_ENABLED` стосується лише локального helper-а й ніколи не обходить production-gate.

`✨ Натхнення` є звичайною частиною кожного придатного виступу Барда й не має окремого production-прапорця. `🎻 Журлива балада` доступна лише всередині рейду Старшого Брата Бочки, тому production-маршрут контролює наявний `BIG_BARREL_BROTHER_RAID_ENABLED`. `/dev_reset_bard_performance` усе одно реєструється лише поза production з `DEV_GRANT_COMMANDS_ENABLED=true`; ручна Telegram QA 0.3.14 лишається pending, але не вимикає runtime-механіку.

Приватний рейд-чат 0.3.15 має окремий default-off прапорець `BIG_BARREL_RAID_CHAT_ENABLED=false` і працює лише разом із `BIG_BARREL_BROTHER_RAID_ENABLED=true`. Вимкнення ховає нові читання, записи й кнопки, але лишає рейд працездатним та запускає фонове очищення старих карток. Для локальної перевірки ввімкніть обидва прапорці; `/dev_raid_chat` усе одно не реєструється у production.

`SUPPORT_JAR_URL` optional. Якщо він заданий, це має бути absolute `https://send.monobank.ua/jar/...` без URL credentials; без нього `/support` і public site не показують битих support-link-ів.

`SUPPORT_JAR_CURRENT_UAH`, `SUPPORT_JAR_GOAL_UAH` і `SUPPORT_JAR_STATUS_UPDATED_AT` optional та ручні. Вони лише показують спокійний read-only стан Банки в `/support` і на public site; це не payment confirmation і не donor state. Дата статусу має бути короткою `YYYY-MM-DD`.

Support Jar setup lives in `docs/backlog/support-jar-backlog.md`; note that the Monobank reward URL and `SUPPORT_JAR_URL` are different links. Do not put `https://t.me/kvestarnia_bot?start=support_thanks` into `SUPPORT_JAR_URL`.

Щоб запустити реального бота, додай токен:

```env
BOT_TOKEN=replace-with-real-token
BOT_USERNAME=kvestarnia_bot
```

Не коміть `.env`, реальні токени, приватні `chat_id` або будь-які секрети.

## Локальні dev-команди

`/dev_reset_me` лишається локальним reset-хелпером і працює, коли `NODE_ENV` не `production`.

Усі `/dev_*` команди мають лишатися non-production only: production feature flags можуть відкривати ігрові поверхні, але не мають реєструвати `/dev_*`, показувати їх у `/help` або `/dev_help`, чи дозволяти dev-only callback mutation. Будь-який новий player-facing timer/cooldown/retry/once-per-period gate, включно з класовими або соціяльними вміннями, має отримати вузьку локальну `/dev_*` команду до PR-ready стану або явний виняток у task doc і PR body. Зокрема `PARTY_SESSION_DEV_HELPERS_ENABLED` не повинен відкривати `/dev_party` у `NODE_ENV=production`.

Value-granting helper commands вмикаються тільки явним локальним opt-in:

```env
NODE_ENV=development
DEV_GRANT_COMMANDS_ENABLED=true
```

Вони працюють лише коли `NODE_ENV` не `production` **і** `DEV_GRANT_COMMANDS_ENABLED=true` / `1` / `yes` / `on`. Не вмикай `DEV_GRANT_COMMANDS_ENABLED` на hosted production: ці команди напряму змінюють рівень, XP, HP, ману, золото, манатки й локальний quest-progress.

- `/dev_help` — показує доступні локальні dev-команди з урахуванням enabled-прапорців.
- `/dev_reset_me` — скидає поточного персонажа.
- `/dev_party` — збирає тимчасову локальну ватагу для перевірки party/session і Big Barrel Brother flows; у production не реєструється й не показується навіть тоді, коли production party/raid feature flags увімкнені.
- `/dev_raid_chat fill [14..131] | clear | expire composer|retention` — наповнює або очищає поточний Big Barrel чат і прискорює строки для перевірки newest-13, ліміту, composer та retention; доступна лише поза production, коли обидва рейдові прапорці ввімкнені.
- `/dev_hp_recovery_due` — за `HP_RECOVERY_NOTIFICATIONS_ENABLED=true` у non-production ранить поточного персонажа, переносить recovery anchor у минуле й ставить один due generation у довговічну чергу; повідомлення напряму не надсилає. У production команда не реєструється, не показується й не мутує стан навіть з увімкненим rollout-прапорцем.
- `/dev_reset_bard_performance` — без аргументів очищає локальний cooldown виступу й Натхнення; `grant 1|2|3|5` видає Натхнення відповідної сили на 13 хвилин. Не скидає музику вже активного рейду: для цього використовуйте наявний локальний reset або новий рейд.
- `/dev_add_level [число]` — додає вказану кількість рівнів поточному персонажу; без числа додає 1 рівень.
- `/dev_add_xp [число]` — додає вказану кількість XP; без числа додає 1 XP.
- `/dev_add_gold [число]` — додає вказану кількість золота до 1 000 000; без числа додає 1 золото.
- `/dev_heal [число]` — лікує поточного персонажа до максимуму, зокрема під час активного бою; з числом додає стільки HP, але не вище максимуму.
- `/dev_restore_mana [число]` — відновлює ману поточного персонажа до максимуму; з числом додає стільки мани, але не вище максимуму.
- `/dev_add_random_item [число]` — додає випадкові манатки; без числа додає одну.
- `/dev_add_item [число] itemId=<item.id>` — додає конкретну манатку з каталогу; без числа додає одну.
- `/dev_add_bandage [число]` — додає бинти відповідальної паніки; без числа додає один бинт.
- `/dev_add_dense_bandage [число]` — додає щільні бинти; без числа додає один щільний бинт.
- `/dev_add_field_kit [число]` — додає польові аптечки; без числа додає одну аптечку.
- `/dev_add_iskrokamin [число]` — додає Іскрокамінь для локальної перевірки Чароковальні; без числа додає один Іскрокамінь.
- `/dev_finish_attunements` — завершує активні таймери налаштування спорядження для поточного персонажа, щоб локально перевірити повідомлення й появу бонусів.
- `/dev_add_yeger_line [число]` — додає єгерські риски на дощечці; без числа додає одну риску.
- `/dev_reset_yeger_bandage` — скидає таймер безкоштовного бинта Єгеря для поточного персонажа.
- `/dev_reset_yeger_trail` — завершує поточне очікування Єгерського сліду для поточного персонажа.
- `/dev_reset_cellar_mouse` — скидає cooldown повторюваної льохової справи миші та дорослішої мишачої домовлености для поточного персонажа.
- `/dev_reset_priest_blessing` — скидає локальний cooldown жрецького благословення/підтримки для поточного персонажа.
- `/dev_reset_quiet_pocket` — скидає локальний cooldown злодійської `Тихої кишені` для поточного персонажа.
- `/dev_reset_bureaucramancer_protocol` — скидає локальний cooldown бюрокромантського `Протоколу 13-З` для поточного персонажа.
- `/dev_reset_varenyk_sated` — стирає `😋 Ситий` самого персонажа та його особисті actor-recipient паузи поточного remort-життя; стан іншого одержувача не чіпає.
- `/dev_reset_rogue` — скидає локальний cooldown `Тихої кишені` та поточний київський день цілей, які цей злодій уже пробував обчистити.
- `/dev_reset_fighting_corner_quest` — стирає тільки пʼять ключів поточного remort-життя справи `Перше правило Бійцівського кутка`; попередні життя не чіпає. Команда реєструється лише поза production, коли `FIGHTING_CORNER_ONBOARDING_QUEST_DEV_HELPERS_ENABLED=true`; production не відкриває її навіть із цим прапорцем.
- `/dev_yeger_first_done` — доводить першу Єгерську дошку `Неспокійні справи` до `5/5` реальними terminal win rows; нагороду й досягнення треба забрати звичайною кнопкою здачі.
- `/dev_yeger_second_done` — доводить другу Єгерську дошку `Неспокійні справи 2.0` до `17/17` реальними terminal win rows після зданої першої дошки; нагороду й досягнення треба забрати звичайною кнопкою здачі.
- `/dev_adventure_reset` — скидає й перетасовує поточний вибір пригоди для швидкого локального тесту.
- `/dev_raid_stop` — достроково завершує активний pending-рейд на Бочку через звичайний reward path для швидкого локального тесту; якщо XP підняв рівень, показує звичайне окреме привітання.
- `/dev_raid_reset` — скидає pending-таймер, зарахований поточний відтинок Бочки й перепочинок після програшу Старшому Брату Бочки для швидкого локального тесту без reward-логіки.
- `/dev_raid_win` — у локальному Big Barrel Brother бою виставляє HP Старшого Брата Бочки в `0`; наступна дія або timeout проходить звичайний party-boss victory path.
- `/dev_reset_monster_rest` — скидає коротку перерву монстрів після серії ordinary боїв у Низі для швидкого локального `/fight` QA.
- `/dev_two_enemies` — стартує dev-only persistent бій проти двох ворогів для перевірки foundation multi-enemy state; production-маршрути лишаються одно-ворожими.

Ці команди не потрапляють у бокове меню Telegram і не показуються у звичайному `/help`. `/dev_help` і кнопка `🧰 Адмінка` показують лише ті dev-команди, чиї non-production gates реально enabled; кнопка зникає, коли не ввімкнена жодна родина dev-команд.

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

Скрипт відновлює лише події, які можна підтягнути без вигадування історії: створення персонажів, рівні з `character_achievements`, rare/epic/legendary манатки з поточного інвентаря та Big Barrel Brother victory sessions. `combat.underdog_won` не backfill-иться, бо архівні combat rows не гарантують точний рівень персонажа на момент бою.

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

Optional performance telemetry variables may remain unset; the effective defaults are:

```env
KVESTARNIA_PERF_SAMPLE_RATE=0
KVESTARNIA_PERF_SLOW_MS=350
YEGER_PERF_DEBUG=false
```

`KVESTARNIA_PERF_SAMPLE_RATE` accepts a clamped `0..1` random-sample rate. Slow calls and measured failures are logged independently of that rate. Performance payloads contain route/count/timing/configuration fields and Render's non-secret `RENDER_GIT_COMMIT` / `RENDER_INSTANCE_ID` metadata when valid; they do not contain Telegram user ids, player text, callback data, tokens, SQL parameters or serialized state.

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
GET /health process liveness, text/plain `kvestarnia ok`
GET /ready database + Telegram polling readiness; `503` until both are ready and during shutdown
```

For production after `0.3.8`, set Render's Health Check Path to `/ready`. Keep `/health` for process-level diagnostics; a live HTTP process is not sufficient evidence that the database and Telegram polling started.

For a controlled post-deploy measurement window, first verify the deployed commit in the emitted metadata, then temporarily set `KVESTARNIA_PERF_SAMPLE_RATE=1` for at least 60 minutes or until the main routes have at least 100 complete samples. Export logs confidentially, restore the rate to `0`, and publish only sanitized aggregates. Do not commit raw logs.

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
