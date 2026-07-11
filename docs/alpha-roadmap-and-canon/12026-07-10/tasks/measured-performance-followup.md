# Task: Measured performance follow-up

## Статус

Потрібна після 0.3.5 Performance P0 Hardening і до наступної широкої optimization task.

## Результат

Отримати достовірний, privacy-safe baseline ключових Telegram routes, довести bounded database behavior для вже виправлених paths і обрати не більше одного наступного performance fix за виміряним впливом.

Якщо evidence не показує суттєвої проблеми, правильний результат задачі — зафіксувати baseline і не робити speculative optimization.

## Передумови

Перед роботою прочитати:

- AGENTS.md;
- docs/tasks/0.3.5-performance-p0-hardening.md;
- docs/operations/playtesting.md;
- docs/architecture/technical-plan.md;
- docs/architecture/security-and-fair-play.md;
- docs/ai/context.md;
- src/bot/performanceLogger.ts;
- instrumentation call sites для route matrix;
- відповідні repository methods і focused tests.

Для versioned implementation використати $kvestarnia-version-task. Для live Telegram sampling plan і ручної перевірки використати $kvestarnia-telegram-qa. Не перетворювати evidence collection на repository-wide refactor.

## Scope

### A. Зробити telemetry contract правдивим

- Span має завершуватися рівно один раз для success, handled failure, thrown error і cancellation/shutdown.
- Додати sanitized outcome та error class/code.
- Перевірити fight start: total duration має включати primary send/edit і persistence of message reference.
- Не називати високорівневий service duration dbMs. Або перейменувати bucket на serviceMs, або звузити вимірювання до repository/transaction work.
- Винести performance env variables у typed config та .env.example.
- Узгодити або прибрати окремий YEGER_PERF_DEBUG format.
- Зберегти sampling і slow-threshold controls.

### B. Зберегти privacy

Заборонені в performance/error evidence:

- BOT_TOKEN та інші secrets;
- database URL;
- Telegram message text;
- callback payload;
- username/display name;
- resultJson або повний serialized state;
- SQL parameters із player data.

Для cross-sample correlation використовувати short-lived correlation id або pseudonymous stable id. Якщо raw Telegram user id залишається, task doc і operations docs мають явно визначити purpose, access та retention.

### C. Зібрати route evidence

Обов'язкова матриця:

| Route family | Representative cases |
|---|---|
| Bandage 93 | success; replay/already claimed |
| DKR | current-day success; repeated action |
| Inventory | open; один detail/pagination path, якщо доступний |
| Mantok chest | selected chest; expired/already handled |
| Fight | fresh start; persistent-active resume; одна action |
| Quest markers | персонаж із кількома активними systems |

Для кожної sample записати:

- route;
- outcome;
- totalMs;
- serviceMs/dbMs із чесною семантикою;
- telegramMs;
- query count або bounded-helper evidence, якщо доступно без sensitive SQL logging;
- fetched/scanned row count для scheduler/list paths;
- environment label без secret values;
- timestamp і code version.

Minimum: виконати вимогу 0.3.5 щодо щонайменше двадцяти representative samples із покриттям кожної route family. Preferred: двадцять samples на family, якщо це можливо без штучного production traffic. Для меншої вибірки зафіксувати confidence limitation.

### D. Перевірити scheduler evidence

Додати або зібрати:

- due;
- scanned;
- processed;
- failed;
- oldestDueLagMs;
- tickMs.

Окремо перевірити:

1. Equipment attunement — чи scan росте з усією історією DailyAction.
2. Passage completion — чи є bounded limit і чи due rows без target застрягають.
3. Solo combat timeout — скільки active JSON rows parse-иться на tick.

Відомий unbounded attunement path не потребує додаткового доказу того, що алгоритмічно він необмежений. Live evidence потрібне для rollout priority і before/after, а не для виправдання самого bounded fix.

### E. Проаналізувати database shape

Для кожного candidate:

- показати exact repository method;
- показати predicates, ordering, projection та limit;
- показати relevant schema indexes;
- за можливості зберегти EXPLAIN/query-plan без sensitive values;
- відрізнити fetched rows від rows actually used;
- вказати, чи робота залежить від повної історії.

Candidates:

- equipment attunement due lookup;
- passage due lookup;
- achievement event recalculation;
- duel/tournament/spar resolved history;
- Mantok global cleanup;
- quest marker aggregate probes;
- public presence/news requests.

### F. Decision gate

Створити ranking:

| Candidate | User impact | Frequency | p95/lag evidence | Growth shape | Fix risk | Decision |
|---|---:|---:|---:|---|---|---|

Дозволено вибрати лише один measured follow-up fix, крім уже підтверджених correctness/boundedness defects attunement і passage.

Якщо owner не затвердив schema change або конкретний candidate, зупинитися після evidence report. Не припускати дозвіл на міграцію.

## Рекомендований перший fix

Якщо current-main evidence не змінило висновок аудиту, першим окремим implementation slice має бути bounded equipment attunement due-state:

- first-class indexed status/readyAt/notifiedAt;
- bounded oldest-first query;
- idempotent notification transition;
- migration/backfill або dual-read для pending legacy rows;
- restart/replay/replacement tests.

Passage completion можна робити другим малим slice без широкої scheduler abstraction.

## Не входить у scope

- Redis, BullMQ або зовнішня job queue.
- SQLite → PostgreSQL migration.
- Новий observability vendor.
- Повний FightService split.
- Загальний repository rewrite.
- Cache для payout/claim/combat authority.
- Баланс, rewards або player-facing gameplay зміни.
- Production deploy без explicit request.

## Тести

Мінімально:

- focused tests для performance logger terminal states і sanitization;
- fight start timing characterization;
- typed config parsing/default/invalid value tests;
- repository tests для chosen query limit/order/projection;
- scheduler replay/restart/duplicate-delivery tests, якщо scheduler змінюється;
- npm run lint;
- npm run typecheck;
- relevant unit tests;
- relevant integration tests.

Перед handoff виконати npm run check, якщо середовище дозволяє. Якщо task містить міграцію, також виконати Prisma validate, fresh migrate і repository integration smoke.

## Deliverables

- Sanitized evidence table або machine-readable summary без private data.
- p50/p95 та sample count для кожної route family.
- Опис семантики кожного timing field.
- Query/index evidence для candidate paths.
- Before/after для реалізованого fix.
- Оновлені task/operations docs із чесним manual QA status.
- Residual-risk і rollback notes.

Raw production logs, user identifiers та database dumps не комітити. Якщо evidence не можна безпечно покласти в репозиторій, зберегти лише агрегований результат і опис процедури.

## Acceptance

### Telemetry

- [ ] Кожен instrumented route завершує рівно один span на success і failure.
- [ ] Fight total охоплює повний send/edit та потрібний persistence step.
- [ ] Timing buckets мають правдиві назви й задокументовану семантику.
- [ ] Performance config typed, documented і tested.
- [ ] Logs не містять secrets, player text, callback data або state JSON.

### Evidence

- [ ] Є representative samples для всіх шести route families.
- [ ] Є sample count, p50, p95, slow count і confidence note.
- [ ] Manual Telegram QA status оновлено фактичним результатом.
- [ ] Є scheduler scanned/due/processed/lag evidence.
- [ ] Database candidates мають method/index/projection/limit analysis.

### Decision

- [ ] Наступний fix пов'язаний з конкретним measured або доведеним unbounded path.
- [ ] Не більше одного нового speculative candidate реалізовано.
- [ ] Before/after використовує однаковий scenario, dataset shape і metric semantics.
- [ ] Correctness, idempotency та replay safety не послаблені.
- [ ] Якщо performance regression не підтверджено, task чесно закрито без зайвої оптимізації.

## Handoff format

1. Evidence collected.
2. Instrumentation corrections.
3. Ranked candidates.
4. Implemented fix або explicit no-change decision.
5. Tests and checks.
6. Operator-only work still pending.
7. Rollback.
8. Residual risk.
