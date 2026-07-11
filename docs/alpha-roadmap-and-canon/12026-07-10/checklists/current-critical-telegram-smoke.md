# Current critical Telegram smoke

Мета — короткий evidence gate для актуального runtime, а не повтор усіх історичних checklist. Виконувати на production-like середовищі або контрольованому production тестовими акаунтами. Не записувати Telegram IDs чи секрети.

## Передумови

- [ ] Зафіксовано version/commit і середовище.
- [ ] Є backup перед stateful repair/backfill діями.
- [ ] Feature flags записані без значень секретів.
- [ ] Підготовлено 2–3 тестових персонажі різних класів.
- [ ] Відомий rollback path і власник спостереження.

## Критичний маршрут

- [ ] Новий персонаж завершує onboarding і бачить зрозумілу наступну дію.
- [ ] `/quest` відкриває overview; фізичний Стіл зберігає повний hub.
- [ ] Quest accept/progress/claim повторним callback не дублює нагороду.
- [ ] Бій: start, attack, item, flee/finish; HP, rewards і Chronicles узгоджені.
- [ ] Adventure risk band відповідає copy й фактичній складності.
- [ ] Inventory/equipment: equip, upgrade, insufficient funds, repeated callback.
- [ ] Attunement настає після потрібної дії, не дублюється після restart.
- [ ] Duel invite/accept/turn timeout/rematch без подвійного claim.
- [ ] Tournament progress і payout витримують replay/restart.
- [ ] Kharakternyk ward: placement cost, support cost, multiple charges і broad-hit semantics збігаються з runtime canon.
- [ ] Big Barrel: create/join/start, personal/broad hit, finish/reward; skipped delivery не блокує state.
- [ ] Charkokovalnia unlock/attempt/result і Mantok Chest rarity працюють за copy.
- [ ] Daily Korchma round, Yeger і table games перевірені лише якщо відповідні flags увімкнені.

## Поточний Бюрокрамант

- [ ] Рівень/клас/мана/cooldown gates коректні.
- [ ] Автор підписаний автоматично; joined sign безкоштовний.
- [ ] Одночасні підписи не губляться й не дублюються.
- [ ] Перший personal hit кожного підписанта заблоковано рівно один раз.
- [ ] Broad hit не блокується протоколом.
- [ ] Snapshot/restart зберігає правильні charges/signers.
- [ ] Repeated callbacks і повторне завершення не дають подвійних rewards/achievements.

## Operations і performance

- [ ] `/health` відповідає як liveness; readiness перевірено окремо або обмеження явно записано.
- [ ] Restart не лишає завислі duel/raid/search/attunement jobs.
- [ ] Зібрано щонайменше 20 sanitized performance samples.
- [ ] Для slow routes записано p50/p95, частку DB/Telegram та sample count.
- [ ] Логи не містять raw Telegram IDs, tokens або message bodies.

## Звіт

Для кожної невдачі записати: крок, очікування, факт, timestamp, version/commit, severity, reproducibility, sanitized log correlation та рішення «block / follow-up / accepted risk».
