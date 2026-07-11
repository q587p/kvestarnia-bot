# Public Front Door and Runtime Readiness

- Статус: запропонована runtime/operations задача після docs reconciliation.
- Base reference: `main` / `0.3.5` / `3c2c5945`; перед активацією перевірити актуальний `origin/main`.
Version: призначити лише під час активації.

## Мета

Зробити публічний сайт чесною й актуальною вхідною поверхнею, а Render health model — здатною відрізнити живий HTTP process від реально готового Telegram runtime.

## Проблема

- Homepage усе ще продає ранній foundation і «майбутні рейди» без distinction між shipped, flagged і planned.
- `/health` завжди відповідає `kvestarnia ok`, навіть якщо production стартував без `BOT_TOKEN` або bot polling не готовий.
- Root page залежить від live presence query; failure може зламати весь front door.
- News archive росте без bound і синхронно читає `news.md` на кожен request.
- Render setup живе переважно в dashboard/manual docs, не у versioned config.

## Scope

### Public front door

- Синхронізувати homepage pitch із canonical current-state.
- Додати current version/stage без технічного перевантаження.
- Розрізнити «доступно», «експериментально/за прапорцем» і «заплановано».
- Зробити zero-presence state нейтральним і не показувати великий нуль двічі.
- При presence failure показувати «дані тимчасово недоступні», не вигадувати `0` і не падати всім homepage.
- Додати GitHub/privacy links, meta description, canonical/OG basics і базові security headers.
- Зробити news archive bounded або paginated; не парсити файл заново синхронно на кожен request без потреби.

### Readiness

- Залишити `/health` як дешевий process-liveness endpoint.
- Додати `/ready` із явним `200 ready` / `503 not ready` contract.
- Readiness має враховувати production config, доступність DB і bot runtime state.
- Production без `BOT_TOKEN` не може виглядати ready; local/test bot-disabled mode лишається підтриманим і явно документованим.
- Runtime повинен мати малий state contract на кшталт `starting`, `ready`, `degraded`, `stopping` без витоку secrets.
- Render health check переводити на `/ready` лише після deploy verification.

### Deploy/config

- Додати перевірений `render.yaml` або versioned deploy snapshot, якщо Blueprint поки не прийнято.
- Зафіксувати build/start command, persistent disk mount, health route і non-secret env names.
- Додати commented perf variables до `.env.example` і developer setup.

## Non-goals

- Не змінювати gameplay, rewards, balance, quests, combat, economy або callback contracts.
- Не додавати webhook migration, Redis, job queue, custom domain або analytics у цій задачі.
- Не робити payment integration і не зберігати donor state.
- Не показувати public player names/timestamps.
- Не вгадувати фактичні production feature flags.
- Не замінювати SQLite/PostgreSQL architecture в межах front-door task.

## Acceptance criteria

- `/health` лишається швидким і не виконує важких DB/API calls.
- `/ready` повертає `503`, якщо production bot token відсутній, DB probe не проходить або runtime не досяг ready state.
- `/ready` не повертає tokens, DB URL, stack traces, Telegram IDs або config values.
- Local/test mode без token працює за документованим contract і покритий тестами.
- Homepage повертає `200` і корисну degraded copy, якщо presence unavailable.
- Public presence privacy invariants не послаблені.
- Homepage wording відповідає current-state й не видає feature-flagged code за production-confirmed.
- Zero-presence state читається як «зараз тихо», а не як негативний social-proof dashboard.
- News archive не рендерить необмежений список усіх releases на кожній сторінці.
- News parsing/caching не послаблює HTML escaping і latest-entry ordering.
- HTML responses мають погоджені security headers; inline CSS/CSP рішення задокументоване.
- Render config/runbook має `/ready`, persistent disk і чинні build/start commands.
- Existing `/`, `/news`, `/presence`, `/api/presence/locations`, `/health` tests лишаються зеленими; додані readiness/degraded tests.

## Relevant files / search terms

- `src/health/publicSite.ts`
- `src/health/server.ts`
- `src/health/news.ts`
- `src/app/createRuntime.ts`
- `src/config/env.ts`
- `src/bot.ts`
- `tests/health/server.test.ts`
- `tests/health/news.test.ts`
- `tests/app/createRuntime.test.ts`
- `tests/config/env.test.ts`
- `.env.example`
- `docs/operations/developer-setup.md`
- `docs/product/current-state.md`
- `render.yaml`, `/health`, `/ready`, `BOT_TOKEN`, `PORT`, `DATABASE_URL`

## Focused tests

- health/readiness route matrix;
- production missing-token readiness failure;
- DB-probe failure and recovery;
- runtime state transitions and shutdown;
- homepage presence failure fallback;
- privacy-safe public presence regression;
- bounded news archive/pagination and invalid index handling;
- news escaping and latest release rendering;
- security headers;
- Render/config parsing where testable;
- потім `npm run check` перед release-ready handoff.

## Manual QA

1. Локально без token: `/health` живий, `/ready` відповідає згідно з documented local contract, сайт відкривається.
2. Test production config без token: readiness fail closed.
3. Симулювати presence failure: homepage живий, privacy-safe degraded copy видима.
4. Відкрити homepage на мобільній ширині, перевірити CTA, version/stage, feature labels, zero state.
5. Перевірити `/news` latest/older/pagination та старе invalid `entry` посилання.
6. Після deploy перевірити `/health`, `/ready`, `/`, `/news`, `/presence` і реальний Telegram `/version`/просту команду.
7. Підтвердити, що Render використовує `/ready`, а rollback path записано.

## Release surfaces

Після призначення номера синхронізувати package metadata, `CHANGELOG.md`, за потреби spoiler-light `news.md`, task registry, compact context, current-state, developer setup і QA evidence. Не робити version bump, доки задача не активована як numbered runtime release.
