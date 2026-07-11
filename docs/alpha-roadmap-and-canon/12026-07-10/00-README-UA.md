# Квестарня: аудит і план розвитку

Зріз підготовлено 12026-07-10 (2026-07-10) за `main` версії `0.3.5`, commit `3c2c594549ae3b52659b9cef161a65cbe2ffcb0b`, відкритими змінами та публічним сайтом.

## Короткий висновок

Проєкт технічно здоровий і значно зріліший, ніж його верхньорівнева документація. Чистий `npm run check` проходить: 3571 тест, lint, typecheck і build. Runtime, package metadata, CHANGELOG, вісті та live-сайт узгоджені на `0.3.5`.

Водночас проєкт ще не готовий до безумовного розширення альфи. Основні прогалини: застарілий product/docs canon, накопичена ручна Telegram QA, неперевірений backup/restore процес, false-green модель `/health`, відсутність live-доказів після performance-релізу й розмивання scope кількох останніх релізів.

Рекомендація: вважати решту `0.3.x` лінією «Closed Alpha Readiness». Спершу завершити й перевірити поточний `0.3.6`, закрити safety/docs/evidence gates, а лише потім додавати вузькі продуктові зрізи. `0.4.x` присвятити утриманню та груповим цілям; `0.5.x` — колекціям, економіці й першому невеликому сезону, якщо це підтвердять дані.

## Як користуватися пакетом

1. Почати з `analysis/01-executive-audit-UA.md` та `analysis/02-current-state-and-open-changes.md`.
2. Прийняти або скоригувати межі `0.3.x` у `roadmap/0.3x-closed-alpha-readiness.md`.
3. Перенести погоджені записи з `task-board.md` у канонічний task index репозиторію.
4. Перед кожною зміною використовувати відповідний файл із `prompts/`; prompts навмисно короткі, англомовні й прив’язані до task-файлів.
5. Не запускати кілька prompts, що змінюють ті самі файли, паралельно.

## Рекомендована черга

1. Поточний gate релізу Бюрокраманта: deep review, виправлення, Telegram QA, deploy verification.
2. Production alpha safety gate: backup/restore, прапорці, readiness, smoke evidence.
3. Docs-only reconciliation після merge поточного релізу.
4. Збір 20+ performance samples і лише потім вибір оптимізації.
5. Public front door/readiness refresh і CI/doc health.
6. Feedback/funnel foundation та поетапні запрошення до альфи.

## Межі цього пакета

- Це аналіз і handoff-план; код та документацію репозиторію не змінено.
- Стан production feature flags, backup і ручної QA не вгадується: там, де немає доказу, записано «потрібно перевірити».
- У пакет не включено секрети, database dump, Telegram identifiers або значення production env.
- Історію релізів не переписано; запропоновано створити короткий current-state layer над нею.
