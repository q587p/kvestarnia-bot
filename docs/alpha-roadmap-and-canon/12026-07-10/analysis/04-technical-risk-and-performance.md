# Технічні ризики та продуктивність

## Паспорт аудиту

- Зріз: main, commit 3c2c5945, package version 0.3.5.
- Дата зрізу: 12026-07-10, Europe/Kyiv.
- Метод: read-only перегляд архітектури, runtime, Prisma schema і repository paths, scheduler-ів, CI, тестів, operations/security docs та реалізації performance instrumentation.
- Перевірки: unit і integration suites виконано окремо; додатково перевірено експериментальний parallel integration run, npm audit та test-only TypeScript config.
- Межа висновків: це аудит репозиторію й локальних тестів, а не production profile. Реальні latency, database size, scheduler backlog і HTTP QPS без live evidence невідомі.

## Підсумковий вердикт

Поточна архітектура придатна для закритої альфи. Вона не потребує мікросервісів, Redis, зовнішньої job queue, нового DI-контейнера або широкого persistence rewrite. Найкраще рішення на найближчий цикл — завершити evidence gate, який сама 0.3.5 уже визначила, виправити два явно необмежені scheduler paths і тільки потім оптимізувати інші маршрути за вимірами.

Код 0.3.5 справді закрив важливу частину P0 hardening:

- bounded current-day/time-window lookups для DailyAction;
- індекс characterId + key + createdAt;
- Mantok selected-only input;
- DKR current-day helper;
- route-level performance spans із sampled logging.

Але release promise ще не закритий операційно:

- task прямо каже, що первинний аудит був статичним, а не live: docs/tasks/0.3.5-performance-p0-hardening.md:9-18;
- manual Telegram QA не виконана: docs/operations/playtesting.md:7-18;
- instrumentation не повністю вимірює failure та end-to-end fight start;
- attunement polling усе ще може сканувати всю історію кожні п'ять секунд.

Тому новий широкий gameplay slice до завершення performance evidence і runtime readiness створює невиправданий ризик: команда матиме більше коду, але не кращу відповідь на питання, де саме витрачається час і чи production process справді готовий обслуговувати бота.

## Сильні сторони поточного дизайну

### Зрозумілий composition root

- Репозиторії створюються централізовано: src/app/createRepositories.ts:39-77.
- Сервіси збираються в одному місці: src/app/createServices.ts:52-249.
- Runtime lifecycle видимий і тестований: src/app/createRuntime.ts:32-177.
- Bot-команди та вертикальні модулі підключаються через src/bot/createBot.ts:21-46.

Це достатня структура для поточного масштабу. Вона дозволяє робити локальні зміни без нового framework або контейнера залежностей.

### Архітектурні межі захищені тестами

- Scope guard фіксує порядок модулів, ownership namespace і відсутність циклів: tests/scope/architectureStabilizationScope.test.ts:115-220.
- Domain не може імпортувати grammY: tests/domain/noGrammyImports.test.ts:5-21.
- Callback helper вже існує: src/bot/callbackRoute.ts:9-24.
- FightService уже переведений на іменований dependency object: src/app/createServices.ts:64-74.

Отже, старі рекомендації про callback helper та FightService wiring не слід повторно заводити як нові задачі.

### Persistence discipline

Схема має багато корисних unique, status та expiry indexes, а сервіси широко використовують idempotency/CAS:

- duel models: prisma/schema.prisma:842-890;
- party models: prisma/schema.prisma:930-1018;
- DailyAction: prisma/schema.prisma:1078-1093.

Міграція індексу DailyAction уже на місці:

- prisma/migrations/20260709180000_daily_action_character_key_created_at_index/migration.sql:1.

Bounded lookup поведінка має тести:

- tests/db/prismaDailyActionRepository.test.ts:4-131;
- tests/db/prismaPaidClaimRepositories.integration.test.ts:554-642;
- tests/db/prismaMantokChestRepository.test.ts:69-94;
- tests/services/dailyKorchmaRoundService.test.ts:81-110.

## Критичні ризики для 0.3.x

| Рівень | Ризик | Доказ | Рішення |
|---|---|---|---|
| P0 | 0.3.5 не має live evidence | docs/tasks/0.3.5-performance-p0-hardening.md:9-18, 108-117, 144-151; docs/operations/playtesting.md:7-18 | Завершити sampling і Telegram smoke до наступної optimization task |
| P0 | Performance spans неповні або неправильно названі | src/bot/performanceLogger.ts:50-91; src/bot/commands/fightCommand.ts:118-127, 201-219, 264-271 | Закривати span у finally, фіксувати sanitized outcome, міряти весь route |
| P0 | Health може бути зеленим без бота | src/config/env.ts:35-39; src/app/createRuntime.ts:73-81; src/health/server.ts:65-67 | Розвести liveness/readiness; production fail-fast без token |
| P0/P1 | Attunement tick може сканувати всю історію | src/db/repositories/prismaEquipmentRepository.ts:187-264; src/bot/equipmentAttunementScheduler.ts:55-64 | Нормалізований indexed due-state або інший bounded cursor |
| P1 | Passage backlog необмежений і може застрягти без chat target | src/bot/passageSearchCompletionScheduler.ts:33-49; src/db/repositories/prismaPassageSearchRepository.ts:164-179 | Default limit, канонічне завершення незалежно від доставки |
| P1 | Shutdown не drain-ить активні scheduler ticks | src/app/createRuntime.ts:152-167 | Async stop-and-drain перед bot.stop і Prisma disconnect |
| P1 | Achievement live path читає великий snapshot | src/services/achievementService.ts:211-232, 628-649; src/db/repositories/prismaAchievementRepository.ts:207-264 | Event-specific aggregates/probes |
| P1 | Duel/tournament/spar читають широкі історії | src/db/repositories/prismaDuelChallengeRepository.ts:115-138, 891-905 | Виміряти, додати status + resolvedAt index і вузькі projections |

## P0: закриття performance evidence

### Що вже реалізовано

Performance logger має route, duration, dbMs, telegramMs, user id та sampled threshold:

- src/bot/performanceLogger.ts:3-18;
- src/bot/performanceLogger.ts:35-48;
- src/bot/performanceLogger.ts:104-123.

Це корисна база, але перед рішеннями про оптимізацію треба усунути три похибки.

### Похибка 1: failure не завершує span

Span пише результат лише коли код доходить до end. Exception path може не залишити performance event:

- src/bot/performanceLogger.ts:50-91.

Потрібен один terminal event для success, failure і cancellation. Error payload має містити тільки route, outcome, error class/code і duration; без Telegram text, callback data, token, state JSON або stack із приватними значеннями.

### Похибка 2: dbMs не завжди означає DB

measureDb огортає високорівневий service call. У цей bucket можуть потрапляти domain calculations, serialization та інші side effects. Це не робить metric марним, але назва вводить в оману.

Мінімальне рішення:

- або перейменувати bucket на serviceMs;
- або вимірювати repository/transaction sections окремо;
- у документації описати точну семантику кожного поля.

Не слід додавати глобальний Prisma query logger у production без sampling і redaction: SQL parameters можуть містити приватні дані.

### Похибка 3: fight start завершується зарано

Fight service call вимірюється в src/bot/commands/fightCommand.ts:118-127. Для persistent active start intro може завершити span через sendResultText, тоді як основний fight card і запис message reference відбуваються пізніше:

- src/bot/commands/fightCommand.ts:201-219;
- src/bot/commands/fightCommand.ts:264-271.

Через це totalMs не є повним end-to-end latency. До baseline sampling цей route потрібно виправити або явно виключити з порівняння.

### Конфігураційний drift

Performance env variables читаються напряму:

- src/bot/performanceLogger.ts:130-145.

Їх немає в typed config schema src/config/env.ts:35-53 і в поточному .env.example. Yeger має окремий YEGER_PERF_DEBUG та власні timing logs:

- src/bot/modules/quest.ts:179-218.

Варто створити один typed performance config contract, задокументувати defaults і прибрати паралельний формат після переходу.

### Мінімальна матриця sampling

| Route family | Обов'язкові сценарії | Що записати |
|---|---|---|
| Bandage 93 | success, already claimed/replay | total, service/db, Telegram, outcome |
| DKR | current-day lookup, repeat action | total, query count або bounded helper evidence |
| Inventory | opening, pagination/details якщо є | total, rows/projection, Telegram |
| Mantok chest | selected chest, expired/already handled | total, cleanup cost, write lock symptoms |
| Fight start/action | new start, persistent active resume, one action | complete end-to-end total, DB/service, send/edit |
| Quest markers | normal character із кількома активними systems | aggregate total і кожен high-level probe |

Task 0.3.5 вимагає щонайменше двадцять representative samples. Для надійного route-to-route baseline бажано мати щонайменше двадцять на кожну route family; якщо production traffic цього не дозволяє, слід чесно зафіксувати меншу вибірку та confidence.

## P0: runtime readiness

BOT_TOKEN optional у config:

- src/config/env.ts:35-39.

Runtime може запустити health server, залогувати відсутність token і повернутися без bot polling:

- src/app/createRuntime.ts:73-81.

Водночас /health завжди повертає 200:

- src/health/server.ts:65-67.

Ця tokenless health-only поведінка закріплена тестом:

- tests/app/createRuntime.test.ts:8-31.

Для production потрібні різні контракти:

- /health — процес живий і HTTP loop відповідає;
- /ready — валідний required config, DB probe успішний, bot startup/polling активний, shutdown не почався;
- production missing/blank token — fail-fast до переходу в ready;
- development/test можуть мати явний health-only mode, але не неявний fallback.

Bot start зараз запускається через void bot.start без lifecycle representation:

- src/app/createRuntime.ts:135-140.

Startup rejection треба перетворити на not-ready і контрольований process failure, а не unhandled asynchronous state.

## P0/P1: equipment attunement scheduler

Репозиторій сторінками читає найстаріші DailyAction із key equipment.attunement, include-ить character/user/equipment і лише потім у Node перевіряє JSON status, notifiedAt та readyAt:

- src/db/repositories/prismaEquipmentRepository.ts:187-264.

Scheduler робить це кожні п'ять секунд:

- src/bot/equipmentAttunementScheduler.ts:55-64.

Якщо due записів менше за limit, кожен tick може пройти всю історію. Наявний DailyAction index допомагає character-scoped lookup, але не вміє індексувати readyAt усередині JSON.

Найменший довгостроково безпечний fix — first-class due-state table або нормалізовані колонки зі status, readyAt, notifiedAt та необхідними foreign keys. Це не потребує переписування equipment service:

1. Нова міграція та repository methods для bounded due selection.
2. Dual-write або backfill для активних pending records.
3. Scheduler читає тільки due rows із limit і стабільним oldest-first ordering.
4. Після перевірки legacy JSON лишається audit payload або прибирається окремою задачею.

Acceptance:

- кількість fetched/scanned rows bounded і не залежить від історичного розміру;
- query plan використовує ready-state index;
- oldest due не голодує;
- повторний tick не надсилає duplicate notification;
- restart, item replacement, cancellation і already-notified мають regression tests.

## P1: passage completion scheduler

Scheduler викликає due lookup без limit:

- src/bot/passageSearchCompletionScheduler.ts:33-40.

Repository застосовує take лише коли caller передав limit:

- src/db/repositories/prismaPassageSearchRepository.ts:164-179.

Due record без chat target пропускається до state resolution і може лишатися running назавжди:

- src/bot/passageSearchCompletionScheduler.ts:37-49.

Target записується після Telegram edit:

- src/bot/modules/combat.ts:693-713.

Малий fix:

- repository default limit 23 або явний scheduler limit;
- state resolution не залежить від наявності delivery target;
- notification — best effort після канонічного CAS transition;
- окремий status для delivery failure потрібен лише якщо продукт хоче retry, інакше достатньо sanitized event;
- characterization test для crash між start/edit/save target.

## P1: achievement recalculation

AchievementService для threshold/progress definitions завантажує full recalculation snapshot:

- src/services/achievementService.ts:211-232;
- src/services/achievementService.ts:628-649.

Repository готує близько 39 паралельних запитів, багато з яких є unbounded findMany, а потім розбирає JSON/history в Node:

- src/db/repositories/prismaAchievementRepository.ts:207-264;
- src/db/repositories/prismaAchievementRepository.ts:269-535;
- src/db/repositories/prismaAchievementRepository.ts:580-731.

Це небезпечно саме тому, що common combat/item events можуть викликати цей шлях часто.

Incremental plan:

- для кожної live event family додати вузький aggregate/probe;
- trackEvent використовує лише probes, потрібні визначенням для цього event;
- full snapshot лишається explicit recovery/admin recalc;
- parity tests порівнюють incremental і full recalc на representative fixtures.

Не потрібно переписувати achievement definitions або вводити event-sourcing.

## P1: duel, tournament та spar histories

listResolvedSince завантажує широку 31-денну історію:

- src/db/repositories/prismaDuelChallengeRepository.ts:115-138.

Projection включає current user, equipment, remort count та інші дані:

- src/db/repositories/prismaDuelChallengeRepository.ts:891-905.

Виклики повторюються в:

- src/services/duelTournamentService.ts:117-173;
- src/services/duelTournamentService.ts:189-255;
- src/services/duelChallengeService.ts:959-970;
- src/services/trainingDoppelgangerService.ts:910-943.

У schema немає індексу status + resolvedAt:

- prisma/schema.prisma:842-861.

Правильний порядок:

1. Додати route timing і fetched-row count для claim, board, leaderboard та spar choices.
2. Додати compound index status + resolvedAt.
3. Звузити historical projection.
4. Прибрати duplicate reads у межах одного logical request.
5. Короткий cache дозволений лише для read-only UI board після вимірювання; payout authority не кешувати.

## Scheduler lifecycle та observability

Runtime синхронно викликає stop, після чого зупиняє bot і від'єднує Prisma:

- src/app/createRuntime.ts:152-167.

Окремі scheduler stop methods лише clear-ять interval і не очікують активний tick:

- src/bot/combatTurnTimeoutScheduler.ts:62-78;
- src/bot/duelTurnTimeoutScheduler.ts:43-63;
- src/bot/equipmentAttunementScheduler.ts:55-73;
- src/bot/passageSearchCompletionScheduler.ts:55-71;
- src/bot/partyBossRecruitingStartScheduler.ts:75-99.

Наслідок: активний tick може звернутися до вже закритого bot або DB. Для notification path це також може дати send succeeded + mark failed, а потім duplicate send після restart.

Потрібен однаковий lifecycle contract:

- start;
- stop accepting new ticks;
- await in-flight tick;
- disconnect external resources.

Не треба одразу створювати shared scheduler framework. Спочатку characterization tests і stopAndDrain для найбільш ризикових scheduler-ів; спільний helper можна витягнути після другого повторення.

Scheduler notification exceptions місцями ковтаються:

- src/bot/combatTurnTimeoutScheduler.ts:110-112, 143-145;
- src/bot/duelTurnTimeoutScheduler.ts:143-145, 187-189.

Мінімальний structured event contract:

- component;
- tickId або correlationId;
- due;
- scanned;
- processed;
- failed;
- oldestDueLagMs;
- tickMs;
- sanitized error name/code.

## Public HTTP surface

Файл news.md має приблизно 240 KB. Кожен request до / читає і парсить його синхронно та звертається до presence service:

- src/health/server.ts:70-86;
- src/health/news.ts:1-12.

/news також читає та парсить файл на кожен request:

- src/health/server.ts:90-93.

Presence endpoints звертаються до БД на кожен request:

- src/health/server.ts:96-113;
- src/db/repositories/prismaPresenceRepository.ts:67-72, 128-149.

Оскільки HTTP і bot працюють в одному процесі та ділять SQLite/event loop, навіть невеликий зовнішній burst може впливати на callback latency.

Найменший fix перед ширшою альфою:

- parse/render news на startup або при file mtime change;
- TTL cache presence на 10–30 секунд;
- request duration/status metrics;
- базові security headers;
- rate limiter або окремий web process — лише за фактичним QPS.

Privacy default добрий: імена доступні лише при explicit publicPresenceNamesEnabled === true:

- src/services/presenceService.ts:434-460;
- tests/health/server.test.ts:202-229.

## CI та швидкість тестів

### Фактичні результати

| Перевірка | Результат на audit host |
|---|---|
| npm run test:unit | 276 files, 3236 tests, green, близько 19.8 s |
| npm run test:integration | 20 files, 335 tests, green, близько 20.4 s |
| Integration із file parallelism | green, близько 6.0 s |
| npm audit --omit=dev | 0 vulnerabilities |
| npm run typecheck:scripts | green, близько 3.1 s |
| npm run lint:scripts | green, менше 1 s |

Audit host використовував Node 24, тоді як CI використовує Node 20:

- .github/workflows/ci.yml:23-27.

Час не слід переносити в release SLO без повтору в CI, але parallelism виглядає перспективно.

Integration config забороняє file parallelism:

- vitest.integration.config.cjs:3-8.

Suites переважно створюють окремі temporary databases, наприклад:

- tests/db/prismaItemCraftRepository.integration.test.ts:27-40.

Безпечний rollout:

1. Увімкнути capped workers у CI branch.
2. П'ять послідовних запусків без SQLITE_BUSY/flakes.
3. Порівняти median duration.
4. Лишити fallback на serial mode, якщо host resource contention з'явиться.

### Пропущені script checks

Package має lint:scripts і typecheck:scripts:

- package.json:19-21.

CI запускає лише основні lint і source typecheck:

- .github/workflows/ci.yml:38-45.

Їх варто додати як дешевий gate.

### Test TypeScript debt

tsconfig.test.json існує, але package/CI його не запускають. Ad hoc noEmit run дав 1366 помилок у 131 test files. Source typecheck і виконання тестів зелені, тому це не 1366 production defects, а переважно debt mocks/fixtures.

Не робити повне очищення одним release blocker. Краще:

- baseline report;
- changed-test ratchet;
- типізувати central factories/fixtures;
- зменшувати baseline окремими maintenance slices.

### Schema drift у repository integration tests

У 19 integration files є локальні createSchema/createMinimalSchema helpers, разом близько 181 CREATE TABLE. Приклад:

- tests/db/prismaPaidClaimRepositories.integration.test.ts:1678-1761.

CI перевіряє fresh Prisma migration:

- .github/workflows/ci.yml:32-36.

Але repository tests можуть лишатися зеленими на ручній схемі, що вже розійшлася з production schema. Рішення на місяці, не на дні:

- один production-schema repository smoke suite;
- або shared migrated template DB;
- не переписувати всі fixtures одразу.

## Security та operations

### Dependency audit

Production dependencies чисті за npm audit --omit=dev. Повний audit має п'ять toolchain advisories: один critical, один high і три moderate. Lock містить Vitest 2.1.9 і Vite 5.4.21:

- package-lock.json:3880-3889;
- package-lock.json:3970-3994.

Vitest використовується через run, а не через exposed UI server, тому це не production outage gate. Але maintenance task має:

- оновити Vitest до patched supported версії;
- прибрати high/critical із full audit;
- додати production audit у CI;
- не запускати Vitest UI/server до оновлення.

GitHub Actions використовують mutable major tags. Immutable SHA pinning — помірний supply-chain hardening, не blocker поточного релізу.

### Logging privacy

Performance logger санітизує payload, але generic bot handler логуює raw error object:

- src/bot/createBot.ts:24-26.

У коді є й інші console.error із повним Error. Потрібен малий sanitized logger contract, а не новий logging framework. За замовчуванням не логувати:

- Telegram token;
- callback data;
- message text;
- database URL;
- resultJson/state JSON;
- player display name.

Performance payload зараз містить raw telegramUserId:

- src/bot/performanceLogger.ts:104-123.

Або замінити його стабільним pseudonymous hash, або явно задокументувати доступ, retention і призначення цього поля. Security doc обіцяє не логувати personal data:

- docs/architecture/security-and-fair-play.md:6-22.

### Backup та restore

Поточний provider — SQLite:

- prisma/schema.prisma:5-7.

Developer setup описує persistent disk і ручні backup кроки перед repairs:

- docs/operations/developer-setup.md:338-369.

Security doc застаріло згадує daily PostgreSQL backup:

- docs/architecture/security-and-fair-play.md:159-162.

До ширшої альфи потрібні:

- daily off-instance backup;
- retention;
- encrypted/access-controlled storage;
- failure alert;
- documented RPO/RTO та owner;
- monthly restore drill: restore → migrate → smoke.

### Full-account deletion

/restart видаляє Character і cascade game state, але залишає User та пов'язану PII/presence історію:

- src/services/restartService.ts:5-11;
- src/db/repositories/prismaCharacterRepository.ts:47-70.

До широкого public launch потрібні privacy notice, retention contract і окремий full-account erasure path. Це не blocker вузького 0.3.x gameplay patch.

## Конфігураційні неузгодженості

PARTY_SESSION_DEV_HELPERS_ENABLED парситься й документується:

- src/config/env.ts:43, 66;
- .env.example:35-37.

Але createServices фактично вмикає helpers для будь-якого non-production незалежно від flag:

- src/app/createServices.ts:201-212.

Production лишається безпечною, що закріплено tests/app/factoryWiring.test.ts:200-243, але config contract неправдивий. Або застосувати nonProduction && flag, або видалити env і документацію.

Boolean parser мовчки трактує unknown string як undefined/default:

- src/config/env.ts:148-163.

Для explicitly supplied invalid value краще fail-fast із назвою змінної, але без value.

Config test приймає PostgreSQL URL:

- tests/config/env.test.ts:46-55.

Водночас Prisma provider зафіксований як SQLite. Це можна залишити як future intent, але operations docs не мають називати PostgreSQL поточним production.

## Великі файли й архітектурний борг

Найбільші runtime hotspots за розміром:

| Файл | Приблизно рядків |
|---|---:|
| src/services/fightService.ts | 5581 |
| src/db/repositories/prismaSoloCombatSessionRepository.ts | 3366 |
| src/domain/combat/monsterAbilityRuntime.ts | 3349 |
| src/domain/combat/combatEngine.ts | 2807 |
| src/services/trainingDoppelgangerService.ts | 2027 |
| src/services/adventureService.ts | 2020 |
| src/bot/modules/tavern.ts | 2012 |

Розмір — це сигнал maintainability, але не автоматичний performance defect. Existing audit уже правильно радить incremental extraction:

- docs/refactoring-audit/analysis/refactoring-audit.md:11-28;
- docs/refactoring-audit/tasks/fight-service-facade-split.md:3-39, 56-69.

FightService слід ділити facade-preserving slices під час feature work, наприклад reward/encounter helpers біля src/services/fightService.ts:4439-5529. Не ставити broad split попереду readiness і bounded scheduler work.

Positional undefined у createServices лишилися для кількох high-arity constructors:

- src/app/createServices.ts:76-90;
- src/app/createServices.ts:101-109;
- src/app/createServices.ts:225-248.

Переводити по одному service на named options у відповідних feature PR, без масового constructor rewrite.

## Додаткові candidates, які спершу треба виміряти

### Mantok cleanup

MantokChestService викликає global cleanup майже на кожен method:

- src/services/mantokChestService.ts:98, 115, 142, 185, 220, 263, 304, 337.

Repository робить updateMany:

- src/db/repositories/prismaMantokChestRepository.ts:364-379.

Це може створювати SQLite write-lock pressure. 0.3.5 навмисно не включала broad cleanup rewrite, тому оптимізувати лише якщо live samples підтвердять. Мінімальний кандидат — process-local throttle або окремий рідший cleanup tick зі збереженням per-token expiry check.

### Quest marker snapshot

Quest marker snapshot паралельно викликає десять високорівневих service probes:

- src/bot/questMarkerSnapshot.ts:35-117.

Паралельність зменшує wall time, але може створювати burst query count, а instrumentation позначає агрегат як DB. Спершу виміряти окремі probes і rows/query count; не створювати складний cache без доказу.

### Combat timeout scan

Solo combat repository читає і JSON-парсить до 1000 active sessions кожні п'ять секунд, бо turnExpiresAt embedded у JSON:

- src/db/repositories/prismaSoloCombatSessionRepository.ts:64-66, 101-171.

Не нормалізувати негайно. Додати scanned, active, due, oldestDueLagMs і tickMs. Indexed turnExpiresAt із dual-read/backfill потрібен лише після scale trigger.

### Tavern monthly leaderboard

Repository обмежує leaderboard 587 rows:

- src/db/repositories/prismaTavernGameRepository.ts:140-156.

Service будує місячний board:

- src/services/tavernGameService.ts:197-215.

Після 587 активних записів ranking може бути неповним. До реального наближення до цього обсягу достатньо metric/truncation signal.

## Рекомендована послідовність

### Найближчі дні

1. Виправити semantics performance spans і typed perf config.
2. Провести Telegram/live sampling для route matrix.
3. Додати production fail-fast і /ready.
4. Зафіксувати baseline, confidence та обрані thresholds.
5. Заморозити нові optimization ideas, доки evidence не ранжує їх.

### Один-два тижні

1. Bounded equipment attunement due-state.
2. Bounded passage completion і crash-safe state resolution.
3. stopAndDrain для scheduler-ів.
4. Scheduler backlog/lag structured events.
5. Увімкнути script checks і перевірити capped integration parallelism.

### Два-шість тижнів

1. Event-specific achievement probes.
2. Duel/tournament/spar index і narrow projections — лише після route evidence.
3. Production-schema repository smoke.
4. Public news/presence caching та HTTP metrics.
5. Toolchain security update.

### Один-три місяці

1. Backup/restore discipline та RPO/RTO.
2. Privacy retention і full-account erasure.
3. Test typing ratchet.
4. Incremental facade extractions у великих сервісах.
5. За metrics визначити triggers для normalized combat due state або переходу від SQLite; не мігрувати наперед.

## Явно не робити зараз

- Не переходити на мікросервіси.
- Не додавати Redis/BullMQ або окремий worker без виміряного scheduler lag.
- Не мігрувати SQLite на PostgreSQL лише через майбутній масштаб.
- Не переписувати FightService, combat engine чи achievements одним великим PR.
- Не кешувати payout authority, claim eligibility або combat state.
- Не додавати глобальне SQL parameter logging у production.
- Не встановлювати абсолютні CI latency thresholds за одним локальним Node 24 run.
- Не трактувати test-only TypeScript errors як runtime regression і не блокувати ними весь 0.3.x.

## Визначення технічної готовності до ширшої альфи

- [ ] 0.3.5 live sampling виконано, baseline і confidence збережені.
- [ ] Performance spans покривають success/failure і повний end-to-end route.
- [ ] /health та /ready мають різні перевірені semantics.
- [ ] Production не стає ready без bot token, DB і bot startup.
- [ ] Attunement і passage due scans bounded.
- [ ] Scheduler shutdown drain-safe.
- [ ] Є daily off-instance backup і датований restore drill.
- [ ] Немає production high/critical dependency advisories; dev toolchain high/critical має закритий update plan.
- [ ] Логи не містять secrets, message text, callback payload або state JSON.
- [ ] Наступна optimization task прив'язана до виміряного route, query shape і before baseline.
