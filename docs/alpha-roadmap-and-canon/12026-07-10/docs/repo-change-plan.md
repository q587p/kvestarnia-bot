# План змін у репозиторії

Base snapshot: `main` / `0.3.5` / `3c2c5945`.

Це change plan, а не готовий patch. Він не змінює runtime або release metadata сам по собі.

## Правила виконання

- Починати кожну зміну з актуального `origin/main`.
- Не створювати довгоживу гілку `0.3.x`.
- Docs-only reconciliation не bump-ить package version і не переписує `CHANGELOG.md`/`news.md`.
- Не називати feature production-enabled без перевіреного production evidence.
- Не рухати historical/audit packages разом із терміновим P0 sync.
- Після кожної хвилі запускати `git diff --check`, internal link scan і raw path scan.

## Хвиля A — P0 current-state reconciliation

Окрема docs-only зміна.

### Змінити

- `README.md`
  - додати public website URL поруч із Telegram CTA;
  - виправити `/quest` / `🗺️ Квести`;
  - замінити старий `0.2.0` next-step абзац коротким current `0.3.x` напрямом;
  - не перетворювати README на повний feature catalog.
- `docs/product/product-brief.md`
  - переписати «Поточний playable slice»;
  - розрізнити shipped, feature-flagged і planned;
  - замінити «Бочку підтримки» на «Банку підтримки»;
  - залишити стабільну product promise, а змінні деталі винести.
- `docs/product/brand.md`
  - додати canonical website URL;
  - уточнити, як говорити про opt-in duels і feature-flagged raid без overpromise.
- `docs/product/roadmap.md`
  - додати header зі станом `0.3.5`, current phase, release line, last-reviewed date та exit criteria;
  - позначити `0.2.x` closed;
  - описати `0.3.0–0.3.5` компактно, не додавати ще одну довгу release history;
  - зробити next decision залежним від `0.3.5` evidence.
- `docs/tasks/README.md`
  - перенести `0.3.5` у shipped;
  - виправити опис `0.3.4`;
  - додати status table та залишити active slot порожнім до gate;
  - позначити дублікати/superseded drafts.
- `docs/ai/context.md`
  - скоротити до identity, hard rules, current version, current gate, key paths і top risks;
  - прибрати release-by-release implementation prose;
  - виправити `0.2.x`/`0.3.x` суперечність.
- `docs/ai/codex-workflow.md`
  - оновити current roadmap guard;
  - додати правило: shipped prompt архівується, raw task path має існувати.
- `docs/DOCUMENTATION_STRUCTURE.md`
  - видалити помилкове твердження, що нинішні category paths є legacy;
  - визначити долю `docs/references/` і `docs/implementation/`.
- `docs/backlog/README.md`, `docs/backlog/QUEST_OVERVIEW_ROUTE.md`
  - позначити quest overview shipped/superseded або перемістити старий задум у history окремою зміною.
- `docs/ai/README.md`
  - чітко відрізнити active reusable prompts від shipped archive.

### Додати

- `docs/product/current-state.md`
  - version/date/SHA;
  - таблиця `shipped`, `feature-flagged`, `production-confirmed`, `planned`, `unknown`;
  - current gate та одна next-decision sentence;
  - правило не вгадувати Render flags.

### Архівувати або виправити

- `docs/ai/prompts/codex-main-0.3.x-quest-overview-route.md`;
- `docs/ai/prompts/kharakternyk-ward-signs-main-codex.md`;
- version-specific prompts для shipped `0.2.x` і `0.3.0–0.3.4`;
- `docs/tasks/0.3.x-adventure-risk-reward-rebalance.md` як superseded `0.3.3`, якщо residual scope не доведено окремо;
- compatibility `skills/ukrainian-rpg-content/SKILL.md`: або синхронізувати з `.agents`, або видалити compatibility copy окремим рішенням.

## Хвиля B — current QA та documentation health

### QA

- Додати `docs/qa/current-release-smoke.md` для `0.3.5` gate.
- Зафіксувати production/manual evidence, дату, environment class і результат без Telegram IDs або secrets.
- Винести історичні version smoke sections із `docs/operations/playtesting.md` до `docs/history/` або `docs/qa/archive/`.
- Перейменувати/переписати заголовок playtesting, який досі говорить «після 0.1.0».

### CI/tooling

- Додати dependency-free Node script, наприклад `scripts/check-documentation-health.mjs`.
- Додати `npm run check:docs`.
- Підключити його в `.github/workflows/ci.yml` і `npm run check` лише після локальної перевірки часу виконання.

Перевірки:

1. Relative Markdown targets існують.
2. Raw repo paths у `README.md`, `AGENTS.md`, `.agents/skills/**`, active `docs/ai/prompts/**`, indexes і current tasks існують.
3. `package.json` version збігається з lockfile, latest changelog/news, current-state і task index.
4. Compact context не перевищує погоджений bytes/words budget.
5. Active prompt не посилається на `shipped`/`superseded` task.
6. Рівно одна task може мати status `active`.
7. History/archive paths перевіряються м’якше: broken link — error, старий текстовий snapshot — allowed.

## Хвиля C — public front door і readiness

Це runtime/operations change; номер версії призначити лише під час активації.

### Public site

- `src/health/publicSite.ts`
  - синхронізувати pitch із `docs/product/current-state.md`;
  - додати version/stage та чесні availability labels;
  - зробити zero-presence state нейтральним;
  - додати GitHub/privacy links і metadata;
  - bounded/paginated news archive.
- `src/health/news.ts`
  - кешувати parsed `news.md` або завантажувати один раз із безпечним refresh contract;
  - не міняти escaping.
- `src/health/server.ts`
  - розділити `/health` і `/ready`;
  - додати security headers;
  - забезпечити degraded homepage при presence failure.
- `src/app/createRuntime.ts`, `src/config/env.ts`
  - тримати явний runtime readiness state;
  - production без bot token має fail readiness або config startup, а не виглядати healthy.
- `tests/health/**`, `tests/app/**`, `tests/config/**`
  - додати readiness, degraded-mode, bounded-news, headers і production misconfiguration coverage.

### Deploy

- Додати перевірений `render.yaml` або versioned `docs/operations/render-deploy-snapshot.md`, якщо Blueprint поки не прийнято.
- Зафіксувати build/start command, `/ready`, persistent disk mount і non-secret env names.
- Secrets, реальний jar URL, database і Telegram token не комітити.
- Додати `KVESTARNIA_PERF_SAMPLE_RATE` і `KVESTARNIA_PERF_SLOW_MS` як commented examples у `.env.example` та пояснити safe production sampling.

## Хвиля D — public governance

- `PRIVACY.md`: які Telegram/game дані зберігаються, що публічне, retention/deletion/contact.
- `SECURITY.md`: приватний vulnerability-reporting channel і supported branch policy.
- `LICENSE` або явний no-license decision у README.
- За потреби `CONTRIBUTING.md`, якщо зовнішні внески приймаються.

Ці документи мають пройти окремий human/legal review; не вигадувати юридичні гарантії.

## Рекомендована послідовність гілок

1. `docs/current-state-reconciliation`
2. `chore/documentation-health-ci`
3. `feat/public-front-door-readiness` або numbered `feat/0.3.x-...` після активації
4. `docs/current-qa-evidence`

Не змішувати P0 docs correction із schema/gameplay змінами. Не називати public-front-door task завершеним, доки Render реально не перевірений після deploy.

## Перевірки завершення

- `git diff --check`;
- `npm run check:docs` після його появи;
- focused health/server/config/app tests для runtime task;
- `npm run check` для numbered runtime release;
- ручне відкриття `/`, `/news`, `/presence`, `/api/presence/locations`, `/health`, `/ready`;
- production misconfiguration probe без `BOT_TOKEN` у non-production fixture;
- Render deploy verification і rollback note;
- відсутність змін у `.env`, database files, secrets і historical release entries.
