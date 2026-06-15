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
- `/start`, `/hero`, `/adventure`, `/fight`, `/inventory`.
- Race/class selection.
- First tiny `/adventure` scene: `Мімік-шаурма`, once-per-date reward, no full combat yet.
- First tiny `/fight` combat probe: deterministic preview, once-per-date reward, no persistent HP loss yet.
- First tiny `/inventory` and `/equipment` surface: persistent deterministic item grants and small equipment effects.
- Simple level-up thresholds for visible progress.
- Combat engine.
- Loot engine.
- Level-up 1–13.
- 20 монстрів, 50 предметів.
- Cooldowns.

Done when:
- Новий гравець за 3 хвилини отримує перший предмет.
- Нагороди ідемпотентні.
- Бій має unit tests.

Current tiny inventory slice:
- `/inventory`, `/items`, `/bag` show persistent манатки.
- `0.0.13` adds item detail callbacks, visible item value/priceless metadata, and preview-only `/equipment`, `/gear`, `/equip` without equipped state or stat effects.
- `0.0.14` persists selected equipment per slot through `character_equipment`, with equip/unequip actions for owned weapon/armor/accessory items, visible inventory total value, and hero wallet context for value in манатки.
- `0.0.15` adds deterministic starter sources for reachable weapon, armor, and accessory examples across `/fight`, the cellar errand, and the Barrel raid, still without equipment stat effects.
- `0.0.17` adds `/hunt` as the first runtime rotation over the bestiary: one deterministic Kyiv-local Hunt Board contract per hour, small rewards, and at most one deterministic monster trophy.
- `0.0.18` hardens Hunt Board callbacks with contract tokens and exposes `/bestiary`/`/monsters` as read-only monster notes without combat sessions, collection tracking, or random loot tables.
- `0.0.19` adds a persisted Hunt Board ledger so posted contracts are auditable and completed hunt callbacks can replay original XP/gold/item summaries without duplicate rewards; the same slice adds light onboarding gates: starter shawarma/fight run only on levels 1-2, cellar errands run on levels 2-3, Hunt Board starts from level 3, and read-only bestiary is held until level 3 to avoid early spoilers.
- `0.0.20` adds the pure domain Combat Engine: serializable fight state, attack/skill/flee resolution, HP/mana, status guards, monster stat derivation, deterministic RNG injection, and unarmed/basic fallback.
- `0.0.21` wires that engine into Telegram `/fight` for level 3+ heroes as persistent solo sessions with HP/mana, turn validation, stale callback safety, lazy expiry, and no XP/gold/items yet. Levels 1-2 keep the starter combat probe.
- `0.0.22` adds small equipment stat effects through one shared effective-stats helper: `/hero`, `/equipment`, item detail, and persistent solo combat read the same equipped-item contributions.
- `0.0.23` adds the first controlled loot engine and reward replay for won persistent solo fights: small XP/gold, at most one monsterLoot item, and stored replay so repeated callbacks do not reroll or duplicate rewards.
- `0.0.24` raises the current alpha cap to level 13, moves the capstone `/restart` suggestion there, and adds a narrow level 4+ cellar follow-up once the mouse errand retires.
- `0.0.25` adds persistent HP/mana attrition and lazy recovery, Loot Expansion v1 for persistent fights, level 4-13 monster trophy coverage, Hunt Board scaling, and the release-surface cleanup from PR #39.
- `0.0.26` is the recovery/balance stabilization pass: clearer HP 0 rest guidance, a small ordinary-monster curve tune for the 3/4/8/13 smoke band, and no new systems.
- Phase 1 finish rule after `0.0.25`: бестіарій лишається data/content foundation і read-only довідником. Не розширювати його як окремий feature track, доки не закритий основний RPG-ланцюжок: recovery/balance polish → inventory/chest polish → levels/resources/rewards tuning → balance/playtest polish. Achievements Phase 1 лишається rewardless later slice, не blocker для бойової петлі.
- Detailed finish sequence lives in `docs/PHASE1_FINISH_PLAN.md`; `docs/NEXT_IMPLEMENTATION_BACKLOG.md` tracks the next small PR order.
- Tavern/adventure/fight first completions can grant fixed items.
- Full itemization, random loot tables, crafting, market, and trading remain later Phase 1+ work.
- Future equipment expansions should keep layering through the same equipment/effective-stats helper instead of adding presenter-specific math.
- Future `/fight` should replace the single generic `Вдарити` action with class/race/combo-aware attack options: physical strikes, mana-spending spells, tricks, seals, songs, traps, and equipment-shaped variants with visible resource costs.
- Future equipment rules should support level-gated items that can drop before they are wearable, plus rarer race/class/path-specific манатки with future bypass/attunement/respec tricks.
- Future player-to-player exchange should let heroes give unsuitable манатки to others without duplicating items or bypassing anti-abuse checks.
- Future item economy should give most манатки a gold value or explicit priceless marker, then use that value for selling, trading, and a later item-to-level exchange.
- New fight loot increases item volume, so `0.0.24` added the first `Дружня Скриня` / `Манатко-скриня` auto-pick sink: 5 eligible манаток become 1 better-than-average output item with confirmation and transaction safety. Manual input selection remains a future inventory polish slice. Canonical planning doc: `docs/MANTOK_CHEST_BACKLOG.md`.

Current repeatable slice:
- `0.0.10` adds «Підвальна справа» as the first low-stakes repeatable fallback after the daily shawarma quest and fight probe are spent.
- Cooldown lives in SQLite `character_cooldowns`, not Redis.
- `0.0.11` adds a compact `Стіл зі справами` quest hub for `/quest`, `🗺️ Квести`, daily shawarma, fight probe, and cellar fallback.
- `/cellar` exists only as a secondary fallback command; more repeatable activities and a full activity refactor remain later work.
- `0.0.24` adds `Справа не до миші` for level 4+ heroes who try the retired cellar route: buy a seal or roleplay past the mouse, obtain `Пляшка Пінного Міражу` once, then hand it in or keep it with permanent completion through `daily_actions`.
- Корчемний рейд у `0.0.11` отримав pending state на випадкові 5–8 хвилин: пригодник «у рейді», а квести, бої та схожі пригодові дії тимчасово недоступні до завершення.
- A future progression/balance pass should make level matter more strongly in HP, mana, combat math, event checks, content gates, and reward-facing decisions.

## Phase 2 — Group hook
Мета: перша фіча, заради якої бот додають у групу.

Deliverables:
- Реєстрація групи.
- `/raid` або «бос дня».
- Join кнопка.
- Майбутній справжній рейд має вимагати мінімум 3 учасників перед стартом або підсумком; поточна Бочка Пінного Міражу лишається solo-compatible placeholder до цього зрізу.
- Коли з’явиться список присутніх у локаціях, корчма має отримати соціяльну дію: пригостити їжею або питвом тих, хто зараз у корчмі.
- Легка presence-система вже є з `0.0.9`: `/online`, `/look`, локальні counts і participants для перших сцен; майбутні групові рейди мають перейти з scene-based ids на справжні raid/session rows.
- Перед розширенням рейдів зберегти малі рішення з `0.0.11`: pending-рейд на Бочку має завершуватися за день старту після date rollover, stale adventure/fight/cellar callback-и не мають переносити presence з Бочки під час pending-рейду, а пивні рейтинги потребують детермінованих tie-breaker-ів.
- Для group gate або виходу з корчми додати впізнавану відсилку до `You must gather your party before venturing forth.` з перших Baldur's Gate; спершу перевірити канонічний український переклад, інакше адаптувати українською без дослівної кальки.
- Колись обіграти `Джурозвір` як мета-жарт про переклад `Familiar` від ШБТ і суперечку довкола нього.
- Колись обіграти дискусію довкола перекладу `dwarf`/`gnome`: Два(о)рфи, Гноми, Карлики, Дверги, Ґноми, Цверґи, Коротуни тощо.
- 1–3 дії учасника.
- Підсумок рейду з топ-учасниками.
- Group leaderboard.
- Fresh-edit guard для Telegram callbacks: якщо callback прийшов зі старого повідомлення, а після нього вже були нові повідомлення бота, слати нове повідомлення замість редагування старого.

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

## Phase 4 — Соціяльна прогресія
Мета: ґільдії, м’яке PvP, сезонність.

Deliverables:
- Створення, вступ і вихід із ґільдії.
- XP ґільдії.
- Бос ґільдії.
- Бойовий куток: consent-based дуелі з присутніми пригодниками, race/class/stat-залежним random resolve, anti-grind caps і daily/weekly recognition.
- Season 1 content.
- Cosmetic titles.

Done when:
- Гравці мають групову мету на тиждень.
- PvP не руйнує новачковий досвід.

## Phase 5 — Economy expansion
Мета: поглибити лут і sinks, не зламавши баланс.

Deliverables:
- Friendly Chest / Манатко-скриня as the first item-volume sink.
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
- Achievements Phase 1: 54 seed definitions, earned/locked/hidden states, paginated `🏅 Ачівки` surface, grouped unlock notifications, no gameplay bonuses. Canonical doc: `docs/ACHIEVEMENTS_PHASE1.md`.
- Collections: «Бестіарій», «Музей Манаток».
- Inspiration-backed content packs із `docs/INSPIRATION_CONTENT_BACKLOG.md`: перші 10–15 монстрів, 20–30 манаток і 5–8 quest/adventure seeds у малих PR з тестами.
- Level-gated equipment, race/class/path-specific rare items, and safe player-to-player item exchange.
- Item values, priceless trophies, and a suspicious outside-korchma item-to-level exchange inspired by Munchkin.
- Stronger level impact pass for resources, combat, event checks, and activity gates.
- Class/race/combo-aware combat actions: multiple attack variants, visible mana costs for spells, fallback actions when mana is low, and equipment/effective-stats integration so манатки eventually shape the numbers.
- Epic levels `14-23`: milestone abilities for races/classes in the spirit of Munchkin-style extra tricks, with visible text flavor and tested balance guardrails.
- Real time-of-day modifiers for tagged enemies and scenes: night strengthens night/dark enemies, while morning/day/evening can affect other encounter types without exposing exact timestamps.
- Повний надвірний журнал прибулих перед корчмою: durable first-arrival events і пагінований список пригодників, які вперше приєдналися або дісталися корчми. Поточна `📜 Табличка прибулих` є presence-based MVP без повної історії.
- Надвірна дошка рівневих досягнень: останні level-up записи, рейтинг за досягнутим рівнем і особливе оформлення 13 рівня.
- Стікерпак для level-up: коли персонаж бере новий рівень, бот зможе надсилати коротке привітання стікером перед або після текстового святкування.
- Daily tavern rumor.
- Корчемне соціяльне частування: пригостити їжею/питвом присутніх у корчмі після появи location presence list.
- Player titles.
- Seasonal boss.
- Вісник ґільдії.
- Meme item generator with moderation.
- Рефералка без ігрових бонусів: запрошення для корчемного обліку, внутрішньої статистики й жартів у записах корчмаря про те, хто кого привів.
- Inline-bot виклики на драку для майбутнього соціяльного PvP: challenge card з інших чатів, але з opt-in, cooldowns і privacy guardrails.
- Moderation tools for group admins.
- Web dashboard for balancing.

## Не робити до стабільної альфи
- Real-money power.
- NFT/crypto/P2E.
- Складний auction house.
- Втрата предметів у PvP.
- 100 рівнів і 200 класів до перевірки core loop.
- Lore bible на 80 сторінок до першого playable build.
