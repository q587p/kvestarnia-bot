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

## Phase 1 — Solo MVP loop (closed in `0.1.0`)
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

Status:
- Closed by `0.1.0 — Phase 1 Closeout`.
- `0.0.x` is no longer the active build line after `0.0.30`.
- Phase 1 is playable and smokeable, not final-balanced and not closed-alpha complete.
- Next work belongs to the `0.1.x` stabilization/playtest line unless a blocker fix is required.

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
- `0.0.27` adds manual Mantok Chest input selection with compact callbacks and stale-input protection.
- `0.0.28` replaces the old hourly Hunt Board reward faucet with the first Yeger unquiet quest and front-door milestone board.
- `0.0.29` adds Yeger tracking wait/ready resolution and the first outside-korchma Munchkin level barter exchange.
- `0.0.30` hardens Munchkin barter with replay-safe audit rows, no gold-only exchange, protected/equipped exclusions, and pending Barrel guards.
- `0.1.0` closes Phase 1 with version, release notes, changelog/news, smoke docs, roadmap/backlog alignment, and no new gameplay runtime.
- `0.1.2` fixes the first post-closeout presence/routing papercut: `Шинок` is now a korchma interior location for routing gates, and presence routing rules are tested outside `createBot.ts`.
- Phase 1 finish rule after `0.1.0`: бестіарій лишається data/content foundation і read-only довідником. Не розширювати його як окремий feature track, доки `0.1.x` playtest не покаже, що core loop стабільний. Achievements Phase 1 лишається rewardless later slice, не blocker для бойової петлі.
- Detailed finish sequence lives in `docs/PHASE1_FINISH_PLAN.md`; the closeout cutline for `0.0.x` → `0.1.x` lives in `docs/PHASE1_CLOSEOUT_0_1_TRANSITION.md`, the final smoke gate lives in `docs/PHASE1_CLOSEOUT_SMOKE.md`, and canonical release notes live in `docs/PHASE1_RELEASE_NOTES.md`. `docs/NEXT_IMPLEMENTATION_BACKLOG.md` tracks the next small PR order.
- Tavern/adventure/fight first completions can grant fixed items.
- Full itemization, random loot tables, crafting, market, and trading remain later work after stabilization.
- Future equipment expansions should keep layering through the same equipment/effective-stats helper instead of adding presenter-specific math.
- Future `/fight` should replace the single generic `Вдарити` action with class/race/combo-aware attack options: physical strikes, mana-spending spells, tricks, seals, songs, traps, and equipment-shaped variants with visible resource costs.
- Future equipment rules should support level-gated items that can drop before they are wearable, plus rarer race/class/path-specific манатки with future bypass/attunement/respec tricks.
- Future player-to-player exchange should let heroes give unsuitable манатки to others without duplicating items or bypassing anti-abuse checks.
- Item economy now uses `goldValue` for display, the Скриня Манаток pressure valve, and the first Манчкін-скупник level exchange. Future selling/trading still needs item-instance safety and clearer player-to-player rules.
- New fight loot increases item volume, so `0.0.24` added the first `Дружня Скриня` / `Манатко-скриня` auto-pick sink: 5 eligible манаток become 1 better-than-average output item with confirmation and transaction safety. `0.0.27` added manual input selection with compact index callbacks, final preview, and stale-input protection; cleanup/reuse for abandoned pending runs remains future polish. Canonical planning doc: `docs/MANTOK_CHEST_BACKLOG.md`.

Current repeatable slice:
- `0.0.10` adds «Льохова справа» as the first low-stakes repeatable fallback after the daily shawarma quest and fight probe are spent.
- Cooldown lives in SQLite `character_cooldowns`, not Redis.
- `0.0.11` adds a compact `Стіл зі справами` quest hub for `/quest`, `🗺️ Квести`, daily shawarma, fight probe, and cellar fallback.
- `/cellar` exists only as a secondary fallback command; more repeatable activities and a full activity refactor remain later work.
- `0.0.24` adds `Справа не до миші` for level 4+ heroes who try the retired cellar route: buy a seal or roleplay past the mouse, obtain `Пляшка Пінного Міражу` once, then carry it to `🍻 Шинок` for permanent turn-in through `daily_actions`.
- Корчемний рейд у `0.0.11` отримав pending state на випадкові 5–8 хвилин: пригодник «у рейді», а квести, бої та схожі пригодові дії тимчасово недоступні до завершення.
- A future progression/balance pass should make level matter more strongly in HP, mana, combat math, event checks, content gates, and reward-facing decisions.

## 0.1.x — Stabilization / Playtest line
Мета: стабілізувати закриту Phase 1 петлю, виправити реальні playtest-болі й лише потім обережно відкривати Phase 2.

Current order:
1. `0.1.1` — playtest bugfixes, copy polish, small UX papercuts, smoke fallout.
2. `0.1.2` — presence interior/routing cleanup after the first post-closeout architecture audit.
3. `0.1.3` — один reliability/polish item за реальним болем: durable Barrel completion notifications або Mantok Chest pending cleanup.
4. `0.1.4` — Hlybka routing або fight/quest navigation cleanup, якщо playtest показує плутанину.
5. Later `0.1.x` — тільки якщо core loop стабільний: перший вузький Phase 2 design/runtime prep або rewardless achievements як retention slice.
6. Later `0.1.x` — Shynok item-for-beer, bestiary filters, Yeger bait/lure/reputation, Munchkin manual selection and other small scoped expansions only if they do not steal the Phase 2 spine.

Guardrails:
- No new large gameplay system in `0.1.0`.
- New runtime feature tracks should wait for smoke and stabilization evidence.
- Phase 2 is now **Social Combat & Interactions**, not «group raid first».
- Old group-raid docs remain useful input for later party/raid work, but they are not the first post-closeout promise.

## Phase 2 — Social Combat & Interactions
Мета: перша причина покликати іншого гравця в Квестарню — короткий opt-in соціяльний бій, результат якого хочеться показати в чаті.

Canonical docs:
- [docs/phase2/SOCIAL_COMBAT_PLAN.md](phase2/SOCIAL_COMBAT_PLAN.md)
- [docs/phase2/DUELS_AND_INVITES.md](phase2/DUELS_AND_INVITES.md)
- [docs/phase2/TRADING_AND_GIFTING.md](phase2/TRADING_AND_GIFTING.md)
- [docs/phase2/GROUP_COMBAT_AND_RAIDS.md](phase2/GROUP_COMBAT_AND_RAIDS.md)

Deliverables:
- Duel invite MVP: challenge, accept/decline/expire, quick resolve, replay-safe result.
- Shareable result/rematch/tournament cards without exact hidden formulas or toxic pressure.
- Trading/gifting MVP: transfer one eligible манатка or stack unit with explicit confirmation and audit row.
- Combat variety: guard, cooldowns, monster skills, action catalog, item tags, one-use manatky.
- `/remort` at level 13 as explicit prestige loop: reset/preserve preview, capped memory bonus, slightly better starting HP/mana, and up to 5 selected eligible manatky; not hidden wipe and not power snowball.
- Multi-enemy combat foundation: main enemy plus controlled helper/summon pattern.
- Party combat and real raids after duel/session/invite and multi-enemy primitives are proven, with capped contribution-aware rare/serious manatky rewards.

Done when:
- Two players can complete an opt-in duel without reward duplication.
- Result/rematch cards are short, safe and useful in Telegram.
- Repeated/stale callbacks replay state instead of mutating it again.
- Social rewards are capped and do not create PvP/economy snowball.
- Remort and raid reward paths are explicit, idempotent and do not create veteran runaway power.
- The data shape does not block later party combat, group raids, trading and gifting.

Non-goals for the first Phase 2 runtime slice:
- No item loss, gold steal, wagers, auction house, guild wars, paid power or forced PvP.
- No full MMO raid engine before smaller social sessions work.
- No Mini App dependency.

## Phase 3 — Closed alpha
Мета: перевірити retention, гумор, UX, баланс і перші соціяльні взаємодії.

Deliverables:
- Admin allowlist.
- Basic analytics events.
- Feedback command.
- Балансні симуляції.
- 2–3 тижні контенту.
- Duel/social-combat telemetry: challenge acceptance, rematch rate, stale callback rate, repeat-pair abuse signals.

Done when:
- Є 30–100 тестерів.
- Зібрані 20+ якісних фідбеків.
- Визначені 5 найбільших friction points.

## Phase 4 — Party Progression
Мета: виростити з Phase 2 social sessions справжні групові цілі.

Deliverables:
- Party combat MVP.
- Real group raids with minimum participant rules, participant actions and idempotent per-player rewards.
- Raid rewards can include more serious/rare manatky than ordinary solo fights only through capped, contribution-aware rules.
- Створення, вступ і вихід із ґільдії.
- XP ґільдії.
- Бос ґільдії.
- Season 1 content.
- Cosmetic titles.

Done when:
- Гравці мають групову мету на тиждень.
- Party/raid rewards не руйнують solo loop і новачковий досвід.

## Phase 5 — Economy expansion
Мета: поглибити лут, sinks, gifting/trading і item identities, не зламавши баланс.

Deliverables:
- Friendly Chest / Манатко-скриня as the first item-volume sink.
- Safe gifting/trading grows beyond the first Phase 2 MVP only after audit/idempotency proves stable.
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
- Polish the suspicious outside-korchma Манчкін-скупник exchange: manual item selection, cleanup/reuse for stale previews, and future item-instance safety before shops/trading.
- Stronger level impact pass for resources, combat, event checks, and activity gates.
- Class/race/combo-aware combat actions: multiple attack variants, visible mana costs for spells, fallback actions when mana is low, and equipment/effective-stats integration so манатки eventually shape the numbers.
- Epic levels `14-23`: milestone abilities for races/classes in the spirit of Munchkin-style extra tricks, with visible text flavor and tested balance guardrails.
- Real time-of-day modifiers for tagged enemies and scenes: night strengthens night/dark enemies, while morning/day/evening can affect other encounter types without exposing exact timestamps.
- Повний надвірний журнал прибулих перед корчмою: durable first-arrival events і пагінований список пригодників, які вперше приєдналися або дісталися корчми. Поточна `📜 Табличка прибулих` є presence-based MVP без повної історії.
- Надвірна дошка рівневих досягнень: останні level-up записи, рейтинг за досягнутим рівнем і особливе оформлення 13 рівня.
- Стікерпак для level-up: коли персонаж бере новий рівень, бот зможе надсилати коротке привітання стікером перед або після текстового святкування.
- Daily tavern rumor.
- Корчемне соціяльне частування: пригостити їжею/питвом присутніх у корчмі після появи location presence list.
- Їжа в `🍻 Шинку` як gold sink із короткими бафами: один активний харчовий баф, підтвердження покупки, гумористичне меню, без stacking-а й без shortcuts до XP/loot.
- Бардівський виступ у `🍻 Шинку`: раз на день або після balance pass раз на годину, перевірка харизми/вдачі, малий capped gold payout, bonus від музичних манаток і starter pack інструментів у loot pool.
- Календарні корчемні дні: недільні/святкові гуляння, малі не-FOMO бонуси, київський час і середові жаби як власний квестарнянський мемний мотив.
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
