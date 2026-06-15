# Codex Workflow

## Як ставити задачі Codex

Структура промпту:

```text
Goal: що треба зробити.
Context: які файли прочитати.
Constraints: стек, стиль, що не чіпати.
Done when: як перевірити готовність.
```

Приклад:

```text
Goal: реалізуй чистий combat engine для MVP.
Context: прочитай AGENTS.md, docs/GAME_DESIGN.md, docs/BALANCE_NOTES.md.
Constraints: domain не має імпортувати Telegram/grammY; RNG через інтерфейс RandomSource; TypeScript strict.
Done when: є unit tests для перемоги, поразки, криту, промаху, втечі; npm test проходить.
```

## Типи змін

### Версійні gameplay/runtime зміни

Версійними вважаються зміни, які впливають на поведінку бота, дані, міграції, баланс, гравецькі повідомлення в runtime або production deployment.

Для таких змін:

- онови `package.json` version тільки коли це прямо входить у задачу;
- онови `CHANGELOG.md` і `news.md`, якщо зміна має йти як реліз;
- заголовки release notes мають містити номер, дату за Holocene calendar і короткий опис; дату брати за київським часом (`Europe/Kyiv`) на момент підготовки/публікації запису;
- PR title для release-oriented зміни починається з номера версії й короткого опису, наприклад `0.0.4 — First Mimic Shawarma Adventure`.

### Docs-only / presentation зміни

Docs-only зміни, які лише покращують README, бренд, product docs, setup docs або workflow docs, **не є номерним релізом**.

Для таких змін:

- не bump-ати `package.json` version;
- не створювати git tag;
- не створювати GitHub Release;
- не оновлювати `CHANGELOG.md` і `news.md`, якщо користувач прямо не попросив;
- не змінювати runtime-код, Prisma schema, migrations або generated files;
- PR title має бути звичайним docs title, наприклад `docs: Polish public README and project docs`;
- у PR body писати `Tests: Not run — docs-only change`, якщо технічні checks не запускалися.

## Перші задачі для порожнього репозиторію

### Task 1 — Scaffold

```text
Goal: створи TypeScript Node.js репозиторій для Telegram RPG bot.
Context: AGENTS.md, docs/TECHNICAL_PLAN.md.
Constraints: npm, Vitest, ESLint, TypeScript strict, SQLite через DATABASE_URL. Не реалізуй ігрові фічі.
Done when: npm run lint/typecheck і npm test проходять; README містить короткий public pitch, а local setup винесено в docs/DEVELOPER_SETUP.md.
```

### Task 2 — Content validation

```text
Goal: додай content model для races, classes, monsters, items.
Context: docs/GAME_DESIGN.md, docs/CONTENT_STYLE_GUIDE.md.
Constraints: Zod validation, stable content ids, без БД.
Done when: є приклади контенту і тест, що всі таблиці валідні.
```

### Task 3 — Combat domain

```text
Goal: реалізуй domain combat engine.
Context: docs/GAME_DESIGN.md, docs/BALANCE_NOTES.md.
Constraints: pure functions, deterministic RNG injection, no Telegram imports.
Done when: тести покривають 5 сценаріїв бою.
```

### Task 4 — Character creation bot flow

```text
Goal: реалізуй /start flow з вибором раси й класу.
Context: docs/GAME_DESIGN.md, docs/CONTENT_STYLE_GUIDE.md, src/content.
Constraints: callback data v1, idempotent create, all text Ukrainian.
Done when: integration test mocks Telegram context; повторний /start не дублює персонажа.
```

### Task 5 — Adventure loop

```text
Goal: зв’яжи /adventure з combat, loot і inventory.
Context: docs/GAME_DESIGN.md, docs/TECHNICAL_PLAN.md, docs/SECURITY_AND_FAIR_PLAY.md.
Constraints: транзакційні нагороди, idempotency keys, cooldown.
Done when: гравець може пройти бій і отримати item; duplicate callback не дублює нагороду.
```

## Робота з subagents

Для складних змін можна попросити Codex створити кілька агентів:

```text
Spawn 4 agents and consolidate:
1. Domain reviewer: знайди проблеми в combat math.
2. Security reviewer: перевір callback/idempotency risks.
3. Content reviewer: перевір український тон і довжину повідомлень.
4. Test reviewer: знайди непокриті edge cases.
```

Для docs-only задач корисніші інші ролі:

```text
Spawn 3 agents and consolidate:
1. Public pitch reviewer: чи README зацікавить людину поза проєктом.
2. Product consistency reviewer: чи docs не обіцяють неготові фічі як готові.
3. Developer docs reviewer: чи setup/playtesting винесено без втрати потрібної інформації.
```

## Як приймати роботу Codex

Після кожного diff перевірити:

- Чи не з’явився Telegram import у `domain/`.
- Чи всі user-facing тексти українською.
- Чи не дублюються нагороди при повторі callback.
- Чи є tests для нової логіки.
- Чи не з’явились магічні числа замість content/balance config.
- Чи не розширився scope понад задачу.
- Для docs-only змін: чи README лишається вітриною, а setup/runbook живе в окремих docs.

## Типові помилки

- Codex робить «MMO все одразу». Зупинити: просити маленький slice.
- Codex пише надто довгі Telegram-повідомлення. Вказати limit у style guide.
- Codex хардкодить Telegram-specific state в domain. Винести в presenter/service.
- Codex додає Prisma schema, але не додає міграцію. Попросити міграцію.
- Codex змінює контент без тестів валідації. Додати tests.
- Codex ставить docs-only polish як номерний реліз. Для presentation docs цього не робити.

## Гілки й PR

Рекомендації для гілок:

- `main` завжди зелений;
- якщо задача прямо не просить stacked PR або іншу base-гілку, дивитися на актуальний `main`, рахувати diff проти `main` і відкривати/retarget PR саме на `main`;
- `docs/public-readme-polish`;
- `feat/combat-engine`;
- `feat/start-flow`;
- `feat/adventure-loop`;
- `feat/group-raid`;
- `fix/idempotent-rewards`.

PR має містити:

- Summary.
- Gameplay impact або `None — docs-only change`.
- Tests run.
- Screenshots або sample bot messages, якщо змінено UI.
- Balance notes, якщо змінені формули.
- Release notes тільки для release-oriented змін.

Для release notes розділяти аудиторії: `CHANGELOG.md` може містити технічні борги й edge cases, а `news.md` має лишатися гравецькою новиною. Не виносити в `news.md` persistent scheduler/restart/deploy debt, Redis/BullMQ, Mini App UI, migrations, scaling або подібний platform backlog.

## Поточна послідовність маленьких PR

Після `0.0.19` канонічний Phase 1 finish path:

1. Combat engine: persistent solo combat session, turn state, HP/mana inside combat, idempotent actions.
2. Equipment stat effects: маленькі прозорі бонуси від уже екіпірованих манаток через один effective-stats helper.
3. Loot engine: контрольовані таблиці здобичі, deterministic/idempotent reward claims, без економічного сніжного кому.
4. Level 1-13 loop: рівневі unlock-и, баланс XP, HP/мани, ворогів і rewards для повного першого діапазону.

Бестіарій лишається data/content foundation і read-only довідником. Не розширювати його як окремий feature track, collection UI, share cards або окремий journal/progression loop, доки не закриті combat → equipment stats → loot → level 1-13. Нові bestiary-зміни допустимі тільки якщо вони прямо обслуговують combat/loot або виправляють безпеку/неточність уже наявного read-only surface.

Докладна послідовність живе в `docs/PHASE1_FINISH_PLAN.md`, а copy-paste backlog для наступних PR — у `docs/NEXT_IMPLEMENTATION_BACKLOG.md`.

Не стрибати в shops, trading, групові hunts/raids або Redis/jobs, якщо користувач прямо не розширив scope.

Docs-only polish README/brand/setup можна публікувати окремим PR без номера версії, без changelog/news і без GitHub Release.
