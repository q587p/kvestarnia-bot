# Task: CI and documentation health

## Outcome

CI ловить не лише code regression, а й типові причини документаційного drift, не створюючи одразу тисячі legacy failures.

## Work

1. Зберегти Prisma validate/migrate checks.
2. Запускати повний `npm run check` або додати відсутні `lint:scripts` і `typecheck:scripts` до CI явно.
3. Додати relative Markdown link check.
4. Додати raw-path checker для `docs/*.md`, `README.md`, `AGENTS.md` і skill references у backticks.
5. Додати release metadata consistency check.
6. Додати status validation для active task index.
7. Обмежити AI context за bytes/words, а не лише за line count: ціль 6–10 KB і приблизно 1000–1500 слів.
8. Розглянути окремий test typecheck ratchet лише для changed/shared fixtures; не блокувати всю legacy cleanup.
9. Окремо оновити Vitest/Vite toolchain і перевірити full dependency audit.

## Acceptance

- [ ] Broken raw task/skill path навмисним fixture ловиться.
- [ ] Shipped task не може лишатися `active`/`next` без явного exception.
- [ ] Context size regression блокується зрозумілим повідомленням.
- [ ] CI не дублює дорогі compile/test кроки без причини.
- [ ] Upgrade dev toolchain не змінює runtime bundle або test semantics.
