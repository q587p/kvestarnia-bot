# Roadmap

## Phase 0 — Foundation
Мета: створити репозиторій, доменну модель і мінімальну документацію.

Deliverables:
- Проєкт TypeScript.
- Lint/typecheck/test/dev scripts.
- Локальна SQLite БД через `DATABASE_URL=file:./dev.db`.
- Базова схема БД.
- Content validation.
- `AGENTS.md` і docs у репозиторії.

Done when:
- `npm test`, `npm run typecheck`, `npm run lint` проходять.
- Є один приклад content entity: race, class, monster, item.

## Phase 1 — Solo MVP loop
Мета: гравець може створити персонажа, пройти бій, отримати XP/лут, екіпірувати предмет.

Deliverables:
- `/start`, `/hero`, `/adventure`, `/inventory`.
- Race/class selection.
- Combat engine.
- Loot engine.
- Level-up 1–10.
- 20 монстрів, 50 предметів.
- Cooldowns.

Done when:
- Новий гравець за 3 хвилини отримує перший предмет.
- Нагороди ідемпотентні.
- Бій має unit tests.

## Phase 2 — Group hook
Мета: перша фіча, заради якої бот додають у групу.

Deliverables:
- Реєстрація групи.
- `/raid` або «бос дня».
- Join кнопка.
- 1–3 дії учасника.
- Підсумок рейду з топ-учасниками.
- Group leaderboard.

Done when:
- 3–5 гравців можуть завершити рейд у групі без ручного втручання.
- Повторні callback-и не дублюють damage/rewards.

## Phase 3 — Closed alpha
Мета: перевірити retention, гумор, UX, баланс.

Deliverables:
- Admin allowlist.
- Basic analytics events.
- Feedback command.
- Балансні симуляції.
- 2–3 тижні контенту.

Done when:
- Є 30–100 тестерів.
- Зібрані 20+ якісних фідбеків.
- Визначені 5 найбільших friction points.

## Phase 4 — Social progression
Мета: ґільдії, м’яке PvP, сезонність.

Deliverables:
- Guild create/join/leave.
- Guild XP.
- Guild boss.
- Дуелі без втрати цінного луту.
- Season 1 content.
- Cosmetic titles.

Done when:
- Гравці мають групову мету на тиждень.
- PvP не руйнує новачковий досвід.

## Phase 5 — Economy expansion
Мета: поглибити лут і sinks, не зламавши баланс.

Deliverables:
- Repair/enchant/reroll.
- Simple crafting.
- Item sink.
- Можливо, market з лімітами.
- Anti-abuse monitors.

Done when:
- Gold inflation контролюється.
- У гравця є вибір, куди витрачати валюту.

## Phase 6 — Mini App optional
Мета: покращити складні екрани, не замінюючи текстову гру.

Deliverables:
- Hero profile UI.
- Inventory UI.
- Collection/codex UI.
- Cosmetic shop/supporter UI.

Done when:
- Mini App покращує UX, але основна гра залишається playable через bot buttons.

## Backlog фіч
- Achievements.
- Collections: «Бестіарій», «Музей Манаток».
- Daily tavern rumor.
- Player titles.
- Seasonal boss.
- Guild herald message.
- Meme item generator with moderation.
- Referral без нав’язливості: нагорода косметична.
- Moderation tools for group admins.
- Web dashboard for balancing.

## Не робити до стабільної альфи
- Real-money power.
- NFT/crypto/P2E.
- Складний auction house.
- Втрата предметів у PvP.
- 100 рівнів і 200 класів до перевірки core loop.
- Lore bible на 80 сторінок до першого playable build.
