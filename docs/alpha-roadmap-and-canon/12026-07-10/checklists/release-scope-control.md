# Контроль scope для versioned release

Мета: зберегти темп малих релізів, але не повторювати ситуацію, коли одна назва release приховує квести, rewards, performance, social UX і combat copy одночасно.

## Основне правило

> Один versioned release має один primary player або reliability outcome.

Release surfaces, tests, migrations і документація, необхідні для цього outcome, не є scope creep. Незалежна фіча або виправлення іншої системи — є.

## Перед активацією задачі

- [ ] Перевірено актуальний `origin/main`, package version і відкриті versioned branches.
- [ ] Обрано рівно один primary outcome одним реченням.
- [ ] Task doc має Goal, Scope, Non-goals, Acceptance criteria, Relevant files, Focused tests, Manual QA і Release surfaces.
- [ ] Усі player-facing labels і hidden mechanics, потрібні для рішення, зафіксовані до реалізації.
- [ ] Визначено source of truth для rewards, state, timers і callbacks.
- [ ] Для economy/balance є `$balance-review` або еквівалентна незалежна перевірка.
- [ ] Для state/persistence/raid/scheduler визначено deep review.
- [ ] Майбутня задача не використовує старий `0.2.x` draft як дозвіл без перевірки current main.

## Тест на єдиний outcome

Якщо відповідь «так» хоча б на два питання нижче, release, ймовірно, треба розділити:

- Чи додається новий player entry point?
- Чи змінюється окремий reward source/sink?
- Чи змінюється combat/raid resolver?
- Чи додається нова persistence/session family?
- Чи змінюється unrelated hot path?
- Чи змінюється public feed/Chronicles семантика?
- Чи змінюється інший social flow?
- Чи task title вже не описує половину diff?

Виняток можливий лише коли другий пункт є необхідним correctness fix для primary outcome. Це треба пояснити в task doc і PR body до review.

## Під час реалізації

- [ ] Main Codex працює лише в межах task doc.
- [ ] Нову unrelated знахідку записано окремо, а не реалізовано «поки файл відкритий».
- [ ] Немає секції `follow-up exception`, що мовчки розширює Scope.
- [ ] Якщо scope змінився, task title/Goal/Non-goals/Acceptance criteria оновлено до подальшої роботи.
- [ ] Якщо зміна стала двома незалежними outcomes, другу частину винесено.
- [ ] Player-visible change має matching QA і release note.
- [ ] Новий timer/cooldown/retry path має безпечний local QA helper або письмове пояснення, чому helper недоречний.
- [ ] Callback replay і stale behavior перевірені до широкого happy-path polish.

## Тріаж неочікуваної знахідки

### Виправити в поточній роботі до merge, якщо

- це blocker/important defect, створений або відкритий саме primary change;
- без нього acceptance criteria неправдиві;
- це data-loss, duplicate-spend/reward, security/privacy або permanent lock ризик у зміненому path;
- fix не створює другого продуктового outcome.

Після рішення:

- оновити task/PR scope;
- додати regression test;
- повторити focused review відповідної ділянки;
- виправити до merge, а не залишати відомий ризиковий defect на наступний реліз.

### Винести в окрему задачу, якщо

- дефект існував до поточної роботи й не блокує її acceptance criteria;
- потрібна окрема міграція або redesign;
- змінюється інший reward/economy/social/combat path;
- немає evidence, що speculative optimization потрібна;
- player-visible результат не відповідає release title.

### Зупинитися й попросити рішення Maintainer, якщо

- fix змінює продуктову обіцянку;
- треба обрати між несумісними mechanic variants;
- збільшується ризик втрати/витрати ресурсів;
- потрібна нова authority, production action або rollout decision;
- task більше не вкладається в один primary outcome.

## Review gate

### `short`

Для малих copy/docs/presenter-only змін без state mutation.

### `default`

Для звичайної feature task із bounded state і добре відомим pattern.

### `deep`

Обов’язково для:

- rewards/economy;
- Prisma migration або transaction boundary;
- combat/raid/party resolver;
- scheduler/timeout/restart recovery;
- concurrency/CAS/idempotency;
- privacy/recipient selection;
- remort/current-life boundary;
- broad routing/combat-lock changes.

Review Codex працює read-only і по changed files за замовчуванням, але може читати необхідний canonical context.

## Merge gate

- [ ] Task doc відповідає реальному diff.
- [ ] PR/release title відповідає реальному primary outcome.
- [ ] Немає невиправлених blocker/important findings.
- [ ] Focused tests пройшли.
- [ ] Обов’язковий repository check пройшов або blocker задокументований і merge не названо safe.
- [ ] Manual Telegram QA проведено для ризикових player flows або gap явно прийнятий Maintainer до merge.
- [ ] Package, lockfile, CHANGELOG і news синхронні, якщо це numbered player/runtime release.
- [ ] Docs-only task не bump-ить package і не створює gameplay news.
- [ ] Feature flag/default зміни описані правдиво.
- [ ] Rollback/disable path відомий для ризикової feature.

## Після merge

- [ ] Перевірено фактичний deploy status, не лише merge status.
- [ ] Проведено короткий live smoke.
- [ ] Зафіксовано performance/error/reward anomaly observation window.
- [ ] Виявлений regression отримує вузьку task; нова feature не стартує поверх blocker-а.
- [ ] Tasks index переміщує роботу з active до shipped.
- [ ] Наступний номер версії не призначається, доки `main` не перевірено ще раз.

## Заборонені патерни

- «Заодно оптимізував чотири інші екрани» без нового scope review.
- «Це лише docs» разом із runtime behavior change.
- «Tests green» як заміна manual QA для Telegram ordering/notification/UI.
- «Feature shipped» лише тому, що код існує за default-off flag.
- «Production enabled» лише з `.env.example`.
- «Полагодимо після merge» для відомого duplicate reward, data loss, stuck state або privacy blocker.
- Один release із кількома незалежними headline paragraphs.
