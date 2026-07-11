# Поточний стан і відкриті зміни

## Базовий зріз

- Гілка: `main`.
- Версія: `0.3.5`.
- Commit: `3c2c594549ae3b52659b9cef161a65cbe2ffcb0b`.
- Публічний сайт: `https://kvestarnia-bot.onrender.com/`.
- `/health`, `/news`, `/presence` і counts-only presence API відповідали під час аудиту.
- Автоматизований gate: `npm run check` пройшов; 276 unit-файлів / 3236 тестів і 20 integration-файлів / 335 тестів, разом 3571.
- Relative Markdown link scan: 374 посилання, 0 відсутніх targets. Raw paths у backticks цей scan не ловить.
- Runtime dependency audit: 0 відомих вразливостей із `--omit=dev`.

## Що вже shipped у `0.3.0–0.3.5`

- Чароковальня, equipment upgrades, Іскрокамінь і attunement.
- Турніри покрокових дуелей.
- Рейдові знаки характерника.
- Adventure risk bands і content refresh.
- Quest Overview та маршрутний onboarding.
- P0 performance instrumentation і кілька bounded-query hardenings.

Факт наявності коду не дорівнює production availability. Big Barrel, table games та інші feature-flagged можливості треба позначати окремо як «реалізовано», «увімкнено за замовчуванням» і «підтверджено у production».

## Поточний кандидат `0.3.6`

Відкрита гілка `codex/0.3.6-bureaucramancer-protocol` додає «Особистий протокол 13-Б» Бюрокраманта. На момент зрізу automated CI зелений, але review submissions/threads відсутні, а manual Telegram QA не виконана.

Основний контракт:

- Бюрокрамант рівня 3+ складає протокол за 5 мани;
- cooldown 93 хвилини;
- укладач підписує його автоматично, приєднання інших безкоштовне;
- кожен підписант блокує свій перший персональний удар Великої Бочки;
- широкий удар не блокується;
- стан переживає restart через snapshot;
- три rewardless achievements;
- є dev reset для повторюваної QA.

У гілці також є starter-copy fix, Mantok Chest rarity/balance fixes, Chronicle strongest-enemy fix, remort pressure tuning та icon collision docs. Через це реліз уже ширший за один механік. Нові follow-ups слід заборонити; кожен наявний блок переглянути як окремий ризик.

### Gate перед merge

1. Changed-files review із фокусом на authorization, CAS/replay, snapshot migration та raid targeting.
2. Перевірка взаємодії personal hit, broad hit, concurrent sign, restart і repeated callbacks.
3. Окрема перевірка кожного bundled follow-up, включно з balance/copy assertions.
4. Telegram QA щонайменше двома персонажами; бажано трьома для concurrent sign/raid case.
5. Повний `npm run check` на актуальній head.
6. Deploy verification та короткий production smoke.

## Окремий draft hotfix

Draft `hotfix/hp-full-notification` має зелений CI, але його не варто merge у поточному вигляді. Періодичні повідомлення потребують durable claim/lease, dedupe, retry, bounded due scan та чітких active-combat semantics. `hpRegenAt` також потребує індексованого due path. Або переробити це як повноцінну delivery subsystem, або відкласти.

## Невирішені факти, які треба отримати

- Які feature flags реально ввімкнені в production — лише назви й boolean state, без секретів.
- Чи пройдено ручну QA для `0.3.1`, `0.3.2`, `0.3.4`, `0.3.5` поза репозиторієм.
- Чи існує off-instance backup, його retention, owner і останній успішний restore.
- Щонайменше 20 sampled/slow performance records після `0.3.5`.
- Реальні active users, onboarding completion, D1/D7 і participation у social loops у privacy-safe aggregate формі.
