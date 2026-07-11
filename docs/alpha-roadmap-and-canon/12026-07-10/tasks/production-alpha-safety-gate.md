# Task: Production alpha safety gate

## Outcome

Мати перевірені, відтворювані операційні основи перед розширенням closed alpha.

## Work

- Зафіксувати sanitized deploy snapshot: build/start commands, liveness/readiness routes, disk mount, database path, env variable names, owner і rollback steps.
- Зафіксувати production feature flags як boolean state без секретних values.
- Налаштувати daily off-instance SQLite backup із retention та failure alert.
- Провести restore на окремій копії: restore → migrations → application smoke.
- Визначити RPO, RTO, backup owner і monthly restore cadence.
- Розвести `/health` як process liveness та `/ready` як production config + DB + bot-runtime readiness.
- У production не залишати missing `BOT_TOKEN` як silent health-only success.
- Додати privacy-safe incident evidence template.

## Guardrails

- Не копіювати production DB у репозиторій або пакет.
- Не друкувати tokens, URLs з credentials чи env values.
- Не перемикати Render health target на `/ready`, доки новий endpoint не перевірено після deploy.
- Не називати PostgreSQL «поточним production», доки schema/provider і runtime лишаються SQLite.

## Acceptance

- [ ] Backup автоматичний, off-instance, encrypted/controlled і має retention.
- [ ] Останній restore drill має дату, duration і результат smoke.
- [ ] RPO/RTO та owner записані.
- [ ] Missing config/DB/bot startup дає not-ready, тоді як liveness semantics лишаються стабільними.
- [ ] Feature-flag inventory має maturity label.
- [ ] Rollback перевірено на нешкідливому сценарії.
