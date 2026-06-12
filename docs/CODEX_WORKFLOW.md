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

## Перші задачі для порожнього репозиторію

### Task 1 — Scaffold
```text
Goal: створи TypeScript Node.js репозиторій для Telegram RPG bot.
Context: AGENTS.md, docs/TECHNICAL_PLAN.md.
Constraints: npm, Vitest, ESLint, TypeScript strict, SQLite через DATABASE_URL. Не реалізуй ігрові фічі.
Done when: npm run lint/typecheck і npm test проходять; README містить local setup.
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

## Skills
У цьому пакеті є два приклади skills:
- `skills/ukrainian-rpg-content` — для генерації/редагування монстрів, предметів, текстів.
- `skills/balance-review` — для рев’ю формул, loot tables, combat simulations.

Їх можна встановити/перенести в конфігурацію Codex за потреби. Навіть без окремого встановлення тексти `SKILL.md` корисні як промпти.

## Як приймати роботу Codex
Після кожного diff перевірити:
- Чи не з’явився Telegram import у `domain/`.
- Чи всі тексти українською.
- Чи не дублюються нагороди при повторі callback.
- Чи є tests для нової логіки.
- Чи не з’явились магічні числа замість content/balance config.
- Чи не розширився scope понад задачу.

## Типові помилки
- Codex робить «MMO все одразу». Зупинити: просити маленький slice.
- Codex пише надто довгі повідомлення. Вказати limit у style guide.
- Codex хардкодить Telegram-specific state в domain. Винести в presenter/service.
- Codex додає Prisma schema, але не додає міграцію. Попросити міграцію.
- Codex змінює контент без тестів валідації. Додати tests.

## Гілки й PR
Рекомендація:
- `main` завжди зелений.
- `feat/combat-engine`
- `feat/start-flow`
- `feat/adventure-loop`
- `feat/group-raid`
- `fix/idempotent-rewards`

PR має містити:
- Summary.
- Gameplay impact.
- Tests run.
- Screenshots або sample bot messages, якщо змінено UI.
- Balance notes, якщо змінені формули.
