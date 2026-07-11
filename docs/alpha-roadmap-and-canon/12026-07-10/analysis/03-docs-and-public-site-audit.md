# Аудит документації та публічного сайту

- Дата зрізу: `12026-07-10`
- Репозиторій: `q587p/kvestarnia-bot`
- Гілка: `main`
- Версія: `0.3.5`
- Коміт: `3c2c5945`
Публічний сайт: <https://kvestarnia-bot.onrender.com/>

## Висновок

Проєкт має сильну інженерну дисципліну, добрий захист ідемпотентности, виразний український голос і корисну задуману структуру документації. Release metadata на поточному зрізі узгоджена: `package.json`, `package-lock.json`, `CHANGELOG.md`, `news.md`, `docs/ai/context.md` та live-сайт показують `0.3.5` і дату `12026-07-10`.

Водночас документацію в цілому вже не можна вважати достатньо узгодженою. Високий темп `0.3.0–0.3.5` випередив README, product brief, roadmap, task registry, Codex workflow, prompt library і ручну QA. Найбільша проблема не в окремій помилці, а у відсутності одного короткого поточного стану, від якого чесно живляться README, сайт, roadmap, task queue та Codex prompts.

До наступної gameplay-фічі потрібен короткий stabilization gate: production evidence для `0.3.5`, docs-only reconciliation і виправлення readiness/deploy поверхні.

## Що перевірено

- root `README.md`, `CHANGELOG.md`, `news.md`, package metadata;
- `docs/README.md`, `docs/DOCUMENTATION_STRUCTURE.md` і category indexes;
- `docs/product/`, насамперед `product-brief.md`, `brand.md`, `roadmap.md`;
- `docs/tasks/README.md`, задачі `0.3.0–0.3.5` і майбутні `0.3.x` drafts;
- `docs/ai/`, active prompts, workflow і compact context;
- `docs/operations/`, Render setup і manual playtesting;
- `src/health/publicSite.ts`, `src/health/server.ts`, runtime startup і health tests;
- live homepage, news archive і public presence;
- внутрішні Markdown links та необгорнуті repo-path references.

## Що зроблено добре

1. **Release lockstep.** `package.json:3`, `package-lock.json:9`, `CHANGELOG.md:10`, `news.md:5` і `docs/ai/context.md:10` узгоджені. `tests/health/news.test.ts:64-107` перевіряє version/date parity.
2. **Задумана інформаційна архітектура.** `docs/README.md:3-57` та `docs/DOCUMENTATION_STRUCTURE.md:14-43` добре розділяють product, design, balance, architecture, operations, QA, AI, tasks, backlog і history.
3. **Безпечна публічна присутність.** `src/health/publicSite.ts:137-159` і `src/health/server.ts:96-113` не показують імена або точні timestamps за замовчуванням; це покрито тестами.
4. **Чесна добровільна підтримка.** `src/config/env.ts:101-111` валідовує Monobank URL, а `src/health/publicSite.ts:200-238` не обіцяє ігрових переваг і не показує зламаного посилання.
5. **Легкий сайт.** Сторінки server-rendered, без важкого клієнтського UI, із HTML escaping, семантичними секціями та mobile breakpoint у `src/health/publicSite.ts:680-701`.
6. **Звичайні внутрішні Markdown links цілі.** Скан 373 Markdown-файлів не знайшов відсутніх relative link targets. Проблеми нижче містяться переважно в plain-text paths усередині prompts і skills, які типовий Markdown link checker не бачить.

## Неузгодженості з доказами

| Пріоритет | Доказ | Що не збігається | Наслідок |
| --- | --- | --- | --- |
| P0 | `README.md:112-118` | README досі називає наступною метою `0.2.0`, хоча поточний `main` уже `0.3.5`. | Новий читач отримує неправильний roadmap. |
| P0 | `README.md:54`; `docs/tasks/0.3.4-quest-overview-route.md:5,21` | README називає `/quest` компактним «Столом зі справами»; фактично `/quest` відкриває overview, а повний hub лишився за фізичним столом. | Публічна інструкція суперечить runtime. |
| P0 | `docs/product/roadmap.md:99,133-134` | Roadmap називає active line `0.2.x` і радить вибирати наступний `0.2.x` prompt. | Немає канонічного переходу до `0.3.x`. |
| P0 | `docs/product/product-brief.md:58-77` | Canonical brief описує ранній foundation, бій без persistent HP і забороняє подавати PvP/group raid як playable. | Product source-of-truth відстав на багато релізів. |
| P1 | `docs/product/product-brief.md:108-122`; `docs/product/brand.md:128-137` | Старе «Бочка підтримки» суперечить канонічній «Банці підтримки». | Роздвоєний бренд. |
| P0 | `docs/tasks/README.md:51-66` | Shipped list закінчується на `0.3.4`, а shipped `0.3.5` позначено як «next». | Codex і людина можуть активувати вже завершену задачу. |
| P0 | `docs/ai/context.md:3` | «Compact context» має 252 рядки, 142 578 байтів і 18 286 слів. | Значна вартість токенів і гірша увага до актуальних правил. |
| P0 | `docs/ai/context.md:237-238` | Один рядок каже, що expansion триває в `0.2.x`, наступний закриває `0.2.x` і починає `0.3.x`. | Пряма суперечність у файлі, який читає Codex. |
| P1 | `docs/ai/codex-workflow.md:189-196` | «Current roadmap guard» досі описує `0.1.x` stabilization. | Workflow не відповідає поточній лінійці. |
| P0 | `docs/ai/prompts/codex-main-0.3.x-quest-overview-route.md:5` | Prompt веде на відсутній `docs/tasks/0.3.x-quest-overview-route.md`; shipped task має номер `0.3.4`. | Broken Codex handoff. |
| P0 | `docs/ai/prompts/kharakternyk-ward-signs-main-codex.md:9,15` | Prompt веде на відсутній `0.2.x` task і називає shipped `0.3.2` майбутнім. | Ризик повторної реалізації. |
| P1 | `skills/ukrainian-rpg-content/SKILL.md:19-20` | Compatibility skill посилається на відсутні `docs/CONTENT_STYLE_GUIDE.md` та `docs/BRAND.md`; `.agents`-копія правильна. | Неоднакова поведінка skill activation. |
| P1 | `docs/backlog/QUEST_OVERVIEW_ROUTE.md:1-9` | Shipped `0.3.4` досі позначено optional future `0.2.x`. | Backlog виглядає як implementation permission. |
| P1 | `docs/tasks/0.3.x-adventure-risk-reward-rebalance.md:3,11-25` | Draft значною мірою дублює shipped `0.3.3` і досі згадує `0.2.31`. | Подвійний scope і застарілий gate. |
| P1 | `docs/DOCUMENTATION_STRUCTURE.md:110` | Нинішні canonical category paths помилково названо legacy placement. | Codex може почати зайве переміщення файлів. |
| P0 | `docs/operations/playtesting.md:18,51,66,79` | Manual Telegram QA для `0.3.5`, `0.3.4`, `0.3.2`, `0.3.1` позначено «not run». | Автоматичні тести не замінюють live Telegram evidence. |
| P0 | `docs/tasks/0.3.5-performance-p0-hardening.md:151` | Після deploy потрібно зібрати щонайменше 20 samples до вибору наступного performance priority; evidence не зафіксовано. | Наступний пріоритет поки не має виміряної основи. |
| P1 | `.env.example:1-44`; `docs/tasks/0.3.5-performance-p0-hardening.md:121` | `KVESTARNIA_PERF_SAMPLE_RATE` і `KVESTARNIA_PERF_SLOW_MS` відсутні в env/setup reference. | Operator може не ввімкнути потрібний sampling або зробити це небезпечно. |
| P0 | `src/health/server.ts:65-67`; `src/app/createRuntime.ts:74-81` | `/health` повертає `ok`, навіть якщо production стартував без `BOT_TOKEN`; DB і polling readiness не перевіряються. | Render може показувати green, коли гра не працює. |
| P1 | `docs/operations/developer-setup.md:338-399` | Render setup описаний лише текстом; `render.yaml` відсутній. | Dashboard і repo можуть непомітно розійтися. |
| P1 | `src/health/publicSite.ts:54,73-81` | Homepage каже «майбутні рейди» та продає лише ранній foundation, тоді як news archive вже містить 95 релізів і shipped social systems. | Landing page недопродає продукт і плутає статуси. |
| P1 | `src/health/publicSite.ts:103-119`; `src/health/server.ts:76,91` | `/news` на кожен запит синхронно читає файл і рендерить усі archive titles. | Лінійне зростання response/CPU з кожним релізом. |
| P2 | `.github/workflows/ci.yml:29-48` | CI не перевіряє Markdown links, raw repo paths, current-version drift або context size. | Уже наявні broken paths не блокують merge. |

## Live-поверхня

### Що узгоджено

- Homepage і news archive показують latest `0.3.5 — 12026-07-10`.
- CTA на `@kvestarnia_bot`, public news, presence і support працюють.
- Presence endpoint повертає privacy-safe JSON; на час перевірки значення було `0`, без імен і локацій.
- Support block повторює fair free-to-play guardrail.

### Що варто змінити

- Додати canonical website URL у `README.md` і `docs/product/brand.md`; зараз він живе лише в GitHub About.
- Показувати короткий stage/version badge і чесну матрицю «доступно / експериментально / заплановано».
- Не рекламувати великий нуль двічі на homepage; за нульового стану використовувати нейтральну сцену «зараз тихо».
- Не називати всі рейди лише майбутніми, якщо в коді та news є feature-flagged Big Barrel Brother. Водночас не називати flagged route production-confirmed без перевірки environment.
- Додати description, canonical/OG metadata, GitHub/privacy links та базові security headers.
- Зробити news index bounded або paginated і не читати `news.md` синхронно на кожен request без кешу.
- Деградувати homepage м’яко, якщо presence query падає: показувати «дані тимчасово недоступні», а не повертати 500 чи вигаданий `0`.

## Ризики для `0.3.x`

1. **Неправильне делегування.** Active prompt може спрямувати Codex на неіснуючий або shipped task.
2. **False-green production.** Публічний сайт може бути живий, а Telegram polling — ні.
3. **Неперевірений rollout.** Кілька великих player-facing slices merged без зафіксованої ручної QA.
4. **Token debt.** Compact context фактично перетворився на ще один changelog.
5. **Public promise drift.** README, brief, website і news описують різні покоління гри.
6. **Configuration drift.** Persistent disk, start command і health route не закріплені versioned config.
7. **Governance gap.** У public repo немає user-facing privacy, root security policy та явного license decision.

## Рекомендований gate перед наступною фічею

1. Зібрати `0.3.5` production samples і записати evidence.
2. Пройти current critical Telegram smoke для `0.3.1–0.3.5`.
3. Виконати task `tasks/docs-current-state-reconciliation.md` як docs-only change без bump.
4. Виправити readiness і front door через `tasks/public-front-door-and-readiness.md`.
5. Лише після цього активувати одну наступну `0.3.x` задачу з точним номером.

Довгожива гілка `0.3.x` не потрібна. Кожен numbered slice має йти короткою гілкою від актуального `main`, а docs-only reconciliation — окремою `docs/` гілкою без release version.
