# Матриця джерел правди

Snapshot: `main` / `0.3.5` / `3c2c5945` / `12026-07-10`.

## Принцип

Джерело правди має бути одне на тип рішення. Інші поверхні або посилаються на нього, або тримають короткий похідний опис. Не слід використовувати `CHANGELOG.md`, `docs/ai/context.md`, task docs і public README як чотири паралельні повні описи поточного продукту.

Бажана ієрархія:

1. **Стабільні правила:** brand, product brief, design, balance, architecture, security.
2. **Поточний стан:** коротка shipped/flagged/planned матриця та active task queue.
3. **Історія:** changelog, news, shipped task records, historical audits.
4. **Виконання:** одна active task, QA evidence, runbooks і Codex prompts.

## Матриця

| Тема | Поточне джерело | Стан на зрізі | Цільове правило |
| --- | --- | --- | --- |
| Назва, голос, терміни | `docs/product/brand.md`, `docs/design/content-style-guide.md`, `docs/design/terminology.md` | Переважно здорові; product brief ще має стару «Бочку підтримки». | `brand.md` вирішує public wording; інші docs не перевизначають назви. |
| Public website URL | GitHub About | У repo немає canonical URL. | Додати URL у `docs/product/brand.md` і root `README.md`; GitHub About має лише повторювати його. |
| Поточна package version | `package.json` | Канонічне `0.3.5`. | `package-lock.json`, app version, latest changelog/news/current-state лише перевіряються проти `package.json`. |
| Технічна історія релізів | `CHANGELOG.md` | Актуальна й докладна. | Не дублювати повні release details у compact context або roadmap. |
| Player-facing історія | `news.md` | Актуальна, live archive читає її напряму. | Зберігати spoiler-light; не використовувати як implementation plan. |
| Поточна доступність фіч | Немає одного джерела | README, brief, website, task docs і flags розходяться. | Створити `docs/product/current-state.md` з колонками `shipped`, `feature-flagged`, `production-confirmed`, `planned`, `unknown`; не вгадувати production env. |
| Product phase | `docs/product/roadmap.md` | Roadmap застряг на `0.2.x`; зв’язок `0.3.x` із Phase 2/3 не визначено. | На початку roadmap тримати current phase, current release line, exit criteria та last-reviewed date. Product phase не дорівнює semver line автоматично. |
| Public product promise | `docs/product/product-brief.md` | Current playable slice сильно застарів. | Brief тримає коротку стабільну обіцянку й посилається на `current-state.md` для змінного inventory. |
| Active/next task | `docs/tasks/README.md` | `0.3.5` досі «next», кілька drafts виглядають одночасно активними. | Рівно одна `active` або жодної під час gate; решта `ready`, `candidate`, `blocked`, `shipped`, `superseded`. |
| Task implementation contract | `docs/tasks/<version>-<slug>.md` | Формат добрий, але shipped і drafts змішані. | Task doc вирішує scope/acceptance для одного slice; після merge status стає `shipped`, а prompt архівується. |
| Codex compact context | `docs/ai/context.md` | 142 KB, суперечить власній token-economy політиці. | Лише identity, hard constraints, current version/active task, key paths і top risks; бажано до 10 KB / 1500 слів. |
| Codex prompt policy | `docs/ai/CODEX_PROMPT_POLICY.md`, `docs/ai/codex-workflow.md`, `.agents/skills/` | Загальна політика добра; current roadmap guard і деякі paths застаріли. | Active prompt завжди посилається на наявний task; shipped prompt переходить в archive. `.agents/skills` — єдиний активний набір або compatibility copies перевіряються CI. |
| Документаційна IA | `docs/README.md`, `docs/DOCUMENTATION_STRUCTURE.md` | Є сильна схема, але рядок 110 суперечить реальному category layout; `references`/`implementation` нечіткі. | Index і placement rules не містять migration-era інструкцій; imported packages мають banner «historical/superseded». |
| Поточний manual QA gate | `docs/operations/playtesting.md`, `docs/qa/` | 1022 рядки історичних smoke-ів; latest manual QA не виконана. | `docs/qa/current-release-smoke.md` тримає лише current gate та evidence; попередні зрізи — history/archive. |
| Production deploy | `docs/operations/developer-setup.md` + Render dashboard | Текст докладний, але dashboard не version-controlled. | `render.yaml` або versioned deploy snapshot вирішує build/start/health/disk shape; secrets лишаються в Render. |
| Liveness/readiness | `src/health/server.ts` | `/health` — лише постійний `ok`, але це не названо окремо від readiness. | `/health` перевіряє process liveness; `/ready` перевіряє production config, DB і bot runtime state; Render використовує `/ready`. |
| Public presence privacy | `docs/architecture/security-and-fair-play.md`, presence service/tests | Внутрішні правила й runtime defaults добрі. | Додати коротку user-facing `PRIVACY.md`: що зберігається, що публічне, retention/deletion/contact. |
| Security reporting | Лише internal security doc | Root `SECURITY.md` відсутній. | Root policy з приватним disclosure channel і supported-version note. |
| License | Немає | Public repo не пояснює права повторного використання. | Явно вибрати license або написати, що код не ліцензовано для повторного використання. |

## Тригери оновлення

| Подія | Обов’язково оновити |
| --- | --- |
| Version bump | `package.json`, lockfile, `CHANGELOG.md`, `news.md`, current-state version, task status; CI перевіряє parity. |
| Нова/змінена public фіча | task doc, current-state availability, README/site лише якщо promise змінюється, relevant design/lore/QA. |
| Feature flag увімкнено в production | production evidence record і `production-confirmed`; не переписувати історичний changelog. |
| Зміна roadmap order | roadmap header, task registry, compact context; не редагувати historical audits як сучасні. |
| Task shipped | task status `shipped`, prompt у archive, current active slot звільнено, QA evidence зафіксовано. |
| Docs move | `git mv`, усі relative/raw refs, skills, prompts, indexes і CI link/path scan. |
| Render config change | versioned deploy config/runbook, readiness tests, rollback note; secrets не комітити. |

## Що не є джерелом правди

- GitHub About не має бути єдиним місцем website URL.
- Imported audit package не визначає current queue після того, як його рекомендації shipped.
- `news.md` не визначає технічний scope.
- Active prompt не замінює task doc.
- `docs/ai/context.md` не має бути повною копією changelog.
- Наявність feature code за flag не доводить, що flag увімкнено в production.
