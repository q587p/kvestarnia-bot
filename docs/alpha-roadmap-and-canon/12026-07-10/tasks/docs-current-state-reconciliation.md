# Docs Current-State Reconciliation

- Статус: запропонована docs-only задача.
- Base snapshot: `main` / `0.3.5` / `3c2c5945`.
- Version bump: ні.

## Мета

Повернути README, product docs, roadmap, task registry, Codex context/prompts і documentation structure до одного чесного стану після `0.3.5`, не змінюючи runtime, gameplay або release history.

## Передумова

На поточному зрізі package/changelog/news/live site узгоджені на `0.3.5`, але:

- README і product roadmap досі називають наступним `0.2.x`;
- product brief описує ранній foundation;
- task registry вважає `0.3.5` наступною задачею;
- compact context має 142 KB і внутрішню суперечність;
- active prompts містять відсутні task paths;
- shipped quest overview досі лежить у backlog як майбутній.

## Scope

1. Додати короткий canonical current-state document із version/date/SHA та availability matrix.
2. Синхронізувати root README, product brief, brand і roadmap із current-state.
3. Виправити `/quest` / `Стіл зі справами` public wording.
4. Позначити `0.3.5` shipped і зробити task status queue однозначною.
5. Скоротити `docs/ai/context.md` до погодженого compact budget.
6. Оновити Codex workflow current guard.
7. Виправити або архівувати shipped/broken prompts і compatibility skill paths.
8. Позначити superseded backlog/task drafts.
9. Виправити documentation placement rule, який називає нинішні category paths legacy.
10. Додати public website URL до README і brand source.

## Non-goals

- Жодних змін у `src/`, `tests/`, Prisma, migrations, package files або lockfile.
- Не змінювати `CHANGELOG.md` чи `news.md`.
- Не bump-ити version і не створювати release/tag.
- Не стверджувати, що feature flag увімкнено в production, без доказу.
- Не реорганізовувати всі 373 Markdown-файли одним великим move.
- Не переписувати historical audit packages так, ніби вони current.

## Acceptance criteria

- У README немає твердження, що наступна мета — `0.2.0`.
- README правильно описує `/quest` як overview і фізичний `Стіл зі справами` як full hub.
- Product roadmap має current `0.3.5`, current phase/release line, last-reviewed date і exit gate.
- Product brief не описує shipped persistent combat/duels як відсутні.
- Public availability розділяє `shipped`, `feature-flagged`, `production-confirmed`, `planned` та `unknown`.
- `docs/tasks/README.md` позначає `0.3.5` shipped; active slot порожній або містить рівно одну явно активовану задачу.
- `docs/ai/context.md` не перевищує 10 KB або 1500 слів, якщо human review не погодить інший budget.
- Context не дублює повний changelog і не суперечить сам собі щодо `0.2.x`/`0.3.x`.
- Active prompts не посилаються на відсутні чи shipped task paths.
- `docs/backlog/QUEST_OVERVIEW_ROUTE.md` більше не виглядає майбутньою implementation permission.
- Canonical naming використовує «Банка підтримки».
- Current category paths не названо legacy placement.
- Усі змінені relative links і raw repo paths існують.

## Relevant files / search terms

- `README.md`
- `docs/product/product-brief.md`
- `docs/product/brand.md`
- `docs/product/roadmap.md`
- `docs/tasks/README.md`
- `docs/ai/context.md`
- `docs/ai/codex-workflow.md`
- `docs/ai/README.md`
- `docs/ai/prompts/`
- `docs/DOCUMENTATION_STRUCTURE.md`
- `docs/backlog/README.md`
- `docs/backlog/QUEST_OVERVIEW_ROUTE.md`
- `.agents/skills/`, `skills/`
- `0.2.0`, `0.3.5`, `current implementation line`, `next task`, `0.3.x-quest-overview`, `0.2.x-kharakternyk`

## Перевірки

- `git diff --check`
- dependency-free relative Markdown link scan
- raw `docs/*.md` / `.agents/skills/*` path scan
- `wc -c -w -l docs/ai/context.md`
- пошук старих current-state тверджень через `rg`
- ручна перевірка всіх змінених indexes

`npm run check` не обов’язковий для чистої docs-only зміни, якщо PR чесно каже `Not run — docs-only change`. Якщо змінюються test fixtures або tooling, запустити відповідні focused checks.

## Manual review

1. Відкрити README як новий гравець: що вже доступно, куди грати, куди рухається проєкт.
2. Відкрити `docs/README.md` як розробник: де product, current task, operations і QA.
3. Відкрити roadmap: чи зрозуміло, що `0.2.x` закрито, `0.3.5` current, а наступна фіча ще gated.
4. Запустити active Codex prompt подумки: усі paths мають існувати, shipped задача не повинна запускатися повторно.

## Release surfaces

- Docs-only; без `package.json`, lockfile, `CHANGELOG.md`, `news.md`, tag або GitHub Release.
