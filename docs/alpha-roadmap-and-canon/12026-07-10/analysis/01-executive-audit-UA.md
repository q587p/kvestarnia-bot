# Виконавчий аудит

## Вердикт

Узгодженість достатня для продовження обережної розробки, але недостатня для швидкого нарощування функцій або широкого запрошення гравців. Найсильніша частина проєкту — runtime та автоматизовані перевірки. Найслабша — current-state canon і production evidence.

Оцінка стану:

| Площина | Стан | Коментар |
|---|---|---|
| Код і автоматизовані перевірки | зелений | 3571 тест, lint, typecheck і build пройшли на чистій інсталяції |
| Release metadata | зелений | package, lockfile, CHANGELOG, вісті та сайт показують `0.3.5` |
| Архітектурна дисципліна | зелено-жовтий | CAS/idempotency і repository boundaries сильні; є окремі історичні hot paths |
| Документаційний canon | жовто-червоний | README, brief, roadmap, task index, AI context і balance notes суперечать поточному стану |
| Ручна Telegram QA | червоний | кілька релізів прямо мають статус «not run» |
| Production operations | жовто-червоний | бракує підтвердженого restore drill, readiness і versioned deploy snapshot |
| Product evidence | жовтий | instrumentation є, але репозиторій не містить потрібного live sampling і alpha funnel |
| Public front door | жовтий | сайт працює й безпечний за presence, але недопродає готове та не розрізняє maturity |

## Що вже добре

- `main` є стабільною інтеграційною гілкою; релізи відображено в CHANGELOG і `news.md`.
- CI покриває migrations, lint, typecheck, unit/integration tests і build.
- Ігрові write paths переважно проектуються з replay safety, idempotency та server-owned rewards.
- Публічна присутність counts-only і не показує імена чи точні timestamps.
- Тон, українська термінологія й free-to-play принципи послідовні.
- Документація має гарну структуру за ролями; проблема не в її відсутності, а в надмірі історичних активних файлів.

## Що блокує ширшу альфу

1. Немає одного правдивого current-state документа: Codex може взяти shipped або superseded task.
2. Критичні flows останніх релізів не мають записаного live Telegram evidence.
3. Production SQLite backup/restore та RPO/RTO не підтверджені практичним drill.
4. `/health` може бути зеленим без робочого Telegram bot runtime; потрібен окремий readiness signal.
5. `0.3.5` вимагає щонайменше 20 live samples до наступної optimization task; доказів ще немає.
6. Поточний реліз `0.3.6` містить основну фічу та кілька follow-ups, тому потребує замороження scope і глибокого перегляду.

## Рішення щодо версій

### `0.3.x`

Закрита альфа й hardening. Дозволені лише:

- завершення вже відкритого вузького gameplay slice;
- blocker reliability fixes;
- docs/canon, QA, backup/readiness, observability;
- feedback/funnel foundation без зовнішнього analytics vendor;
- малі evidence-driven friction fixes.

Не дозволені без окремого рішення: guilds, market, повний consumables engine, нова велика economy system, broad rewrite або infrastructure migration «про всяк випадок».

### `0.4.x`

Утримання першого тижня, повторні групові сесії та типізований контракт взаємодії рейдових ролей. Новий рейдовий mechanic додається лише після simulation і перевірки сумісності з уже наявними знаками/протоколами.

### `0.5.x`

Колекції, контрольована economy expansion і Season Zero — лише якщо alpha metrics підтвердять, що це вирішує реальну проблему утримання.

## Головний принцип

Наступний реліз обирається не за розміром backlog, а за найсильнішим доказом: blocker із QA, виміряний latency/backlog, повторюваний feedback або продуктова метрика. Якщо доказу немає, наступна робота — отримати доказ.
