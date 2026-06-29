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
- `0.0.30` hardens Munchkin barter with replay-safe audit rows, no gold-only/gold-heavy exchange, protected/equipped exclusions, and pending Barrel guards.
- `0.1.0` closes Phase 1 with version, release notes, changelog/news, smoke docs, roadmap/backlog alignment, and no new gameplay runtime.
- `0.1.2` fixes the first post-closeout presence/routing papercut and opens the first explicit level-13 `/remort` loop: `Шинок` is now a korchma interior location for routing gates, presence routing rules are tested outside `createBot.ts`, and remort drafts/history are replay-safe.
- `0.1.3` adds reliability polish for already-shipped loops: durable Barrel completion notifications survive restart/retry, and stale pending Дружня Скриня runs expire without touching inventory.
- `0.1.4` clarifies Quest Hub/fight navigation: fight buttons distinguish ready, active and terminal states; return paths consistently point back to `Стіл зі справами`; Quest Hub list/archive callbacks stay neutral in middleware and only successful handlers write quest-table presence after gates pass. Глибка remains deferred runtime.
- `0.1.5` opens the first Phase 2 prep surface: level 3+ `🥊 Бійцівський куток` and `/spar` run a turn-based XP-only training fight against the `Сумлінний Допельґанґер`, with no real duel invites, PvP state, gold/items/manatky rewards, `Тринадцять дрібних проблем` progress or group raid.
- `0.1.6` extends the Korchmar/Shynok problem wrapper into explicit `13 -> 23 -> 42 -> 93` stages: each new stage is accepted through the bar after the previous turn-in, counts only fresh ordinary won solo fights after its issue timestamp, and keeps doppelganger training out of quest progress.
- `0.1.9` adds the first reusable combat flavor intent layer and uses it only for `/spar` presentation: the doppelganger now shows class-aware counter flavor without changing rewards, problem-chain counters, cooldowns, level gates or PvP scope.
- `0.1.10` ships the first rewardless duel invite ledger: level 3+ `/duel`, dedicated Fighting Corner entry point, deep-link invites, accept/decline/cancel/expire handling, replay-safe quick results, partial HP/mana warnings, missing-character onboarding copy, a rewardless day/week/month duel winners board, clearer filtered equipment slot context and a closed `Глибка` route stub for future Korchmar monster fights.
- `0.1.11` adds rewardless duel result follow-ups: resolved cards can create a targeted rematch between the original participants or send a separate shareable saved-result card, while remort now clears per-life starter/problem-chain daily action keys after confirm.
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

Status:
- Closed by `0.1.25 — Phase 2 MVP Closeout`.
- `0.1.x` should receive only emergency hotfixes after this closeout.
- Current implementation line is `0.2.x`: safe gifting shipped in `0.2.0`, multi-enemy foundation shipped in `0.2.1`, architecture stabilization shipped in `0.2.2`, ordinary threat escalation shipped in `0.2.3`, item tags/one-use bandages shipped in `0.2.4`, Bard Performance shipped in `0.2.5`, Passage Search shipped in `0.2.6`, Player Abilities shipped in `0.2.7`, rewardless achievements/cosmetic title records shipped in `0.2.8`, Daily Korchma Rounds shipped in `0.2.9`, Active Cosmetic Title Selection shipped in `0.2.10`, Combat Balance / Monster Signature Proof shipped in `0.2.11`, Two-Enemy Threat Simulation / Outlier Tuning shipped in `0.2.12`, Postal Manatka Delivery shipped in `0.2.13`, Adventure Quest Readability / Local Failure shipped in `0.2.14`, and Party Session Foundation shipped in `0.2.15`.

Current order:
1. `0.1.1` — playtest bugfixes, copy polish, small UX papercuts, smoke fallout.
2. `0.1.2` — presence interior/routing cleanup plus first runtime `/remort` at level 13, because playtest reached the cap sooner than the old Phase 2 plan expected.
3. `0.1.3` — reliability polish за реальним болем: durable Barrel completion notifications плюс Mantok Chest pending cleanup.
4. `0.1.4` — fight/quest navigation cleanup; Глибка лишається відкладеною runtime-локацією, доки core navigation не перестане хитатися.
5. `0.1.5` — перший вузький Phase 2 runtime prep з 3 рівня: Бійцівський куток і тренувальний Сумлінний Допельґанґер з малим XP-only результатом, без золота/items/манаток, `Тринадцять дрібних проблем` progress і реального PvP.
6. `0.1.6` — Корчмарський problem-chain follow-up: `13 -> 23 -> 42 -> 93`, bar turn-in, fresh counters from issue time, no training/PvP/group-raid progress.
7. `0.1.9` — combat flavor intent foundation: class-aware `/spar` counter flavor as a presentation-only step toward monster signature moves and duel result cards.
8. `0.1.25` — release/docs/smoke closeout: Phase 2 MVP status, accepted two-account regression, deferred `0.2.x` order and no gameplay runtime changes.

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
- [docs/phase2/COMBAT_TACTICS_AND_FLAVOR.md](phase2/COMBAT_TACTICS_AND_FLAVOR.md)
- [docs/phase2/TRADING_AND_GIFTING.md](phase2/TRADING_AND_GIFTING.md)
- [docs/phase2/GROUP_COMBAT_AND_RAIDS.md](phase2/GROUP_COMBAT_AND_RAIDS.md)
- [docs/PHASE2_MVP_CLOSEOUT_PLAN.md](PHASE2_MVP_CLOSEOUT_PLAN.md)
- [docs/PHASE2_CLOSEOUT_SMOKE.md](PHASE2_CLOSEOUT_SMOKE.md)
- [docs/PHASE2_DEFERRED_0_2.md](PHASE2_DEFERRED_0_2.md)

Closeout cutline:
- `0.1.24` is the final feature release of the `0.1.x` Phase 2 MVP line.
- `0.1.25` closes the line as a docs/release/smoke milestone with no new gameplay.
- Safe gifting shipped first in `0.2.0`; `0.2.1` shipped only the backward-compatible two-enemy foundation; `0.2.2` shipped behavior-preserving architecture stabilization; `0.2.3` shipped ordinary-only threat escalation on top of that foundation; `0.2.4` shipped the first item-tag and one-use bandage slice; `0.2.5` shipped the first no-XP Bard Performance social technique; `0.2.6` shipped the first no-XP Passage Search side action for `Спуск до Низу` and passage previews; `0.2.7` shipped player class/race combat abilities; `0.2.8` shipped rewardless achievement browsing and cosmetic title grant records; `0.2.9` shipped the once-per-Kyiv-day Daily Korchma Round route; `0.2.10` shipped active cosmetic title selection; `0.2.11` shipped a bounded combat-balance and monster-signature readability proof; `0.2.12` shipped two-enemy threat simulation, backup pressure guards and targeted outlier tuning; `0.2.13` shipped paid postal delivery for bounded manatka packages to known recipients; `0.2.14` shipped Adventure selected-card readability and no-reward local failure; `0.2.15` shipped a dev/flagged party recruiting/session foundation without combat or rewards. Broader trading, equipment rebalance, profession engines, in-combat item catalogs, active title abilities and party/raid runtime stay in later `0.2.x+` slices.
- The next implementation prompt should be chosen from the current `0.2.x` task docs, with active title abilities and selected signature techniques split into separate evidence-gated follow-ups.

Deliverables:
- Бійцівський куток із тренувальним `Сумлінним Допельґанґером`: копія поточного героя для level 3+ спарингу перед справжніми дуелями з гравцями. Майбутні дуелі також стартують з 3 рівня, якщо окремий балансний PR не змінить це явно.
- First duel invite MVP shipped in `0.1.10`: challenge, accept/decline/cancel/expire, quick rewardless resolve, replay-safe result, generated deep links via `BOT_USERNAME`, a dedicated Fighting Corner screen and a rewardless winners board. `0.1.11` adds manual targeted rematches and shareable saved-result cards without rerolls; `0.1.18` adds persistent turn-based duels with small XP-only terminal rewards and no gold/items/manatky rewards.
- Tournament cards without exact hidden formulas or toxic pressure.
- `0.2.0` Safe Gifting MVP: transfer one eligible манатка stack unit with explicit recipient acceptance, audit row, reservation checks and replay-safe terminal states.
- `0.2.1` Multi-Enemy Foundation: persistent PvE combat can store and resolve exactly two enemies behind a dev-only route while production starts remain one-enemy and rewards stay single-encounter.
- `0.2.2` Architecture Stabilization: shipped real vertical bot modules, extracted cross-cutting middleware, explicit composition root/runtime lifecycle and architecture boundary tests without gameplay, schema, callback or copy changes.
- `0.2.3` Threat Escalation MVP: three consecutive eligible one-enemy ordinary wins make the next eligible ordinary fight start with exactly two enemies, with stored stable escalation copy and no reward multiplication.
- `0.2.4` Item Tags and One-use Bandages: shipped a narrow item tag contract, one out-of-combat one-use bandage with replay-safe confirmation, Єгер bandage supply and a small authored monster-loot entry.
- `0.2.5` Bard Performance MVP: shipped a level 3+ Bard performance solo in Shynok or in any other current location with another active same-location character, frozen CHA/LUCK/level check, 93-minute per-location cooldown, 13-minute audience window, Shynok-only capped house gold, voluntary same-location applause/tips and no XP/items/buffs/profession engine.
- `0.2.6` Passage Search MVP: shipped `🔎 Пошукати` on `Спуск до Низу` and frozen passage previews, with a short timer, per-node cooldown, replay-safe ledger, tiny no-XP finds and a danger branch that starts the stored passage monster with the monster acting first.
- `0.2.7` Player Abilities MVP: shipped class/race ability catalogs, race action buttons, group-ready solo fallback and hidden fumble replay for persistent PvE, training and turn-based duels.
- `0.2.8` Achievements and Cosmetic Title Records: shipped rewardless achievement browsing from `/hero`, expanded seed unlock hooks, all/earned/locked filters, manual recalculation and persisted cosmetic title grant provenance with no power effects.
- `0.2.9` Daily Korchma Rounds: shipped level 3+ `Корчмарський обхід` with one yard scene, two distinct interior scenes, any-two completion, explicit Quest Table reward turn-in, replay/remort-safe `daily_actions` rows and no schema migration.
- `0.2.10` Active Cosmetic Title Selection: shipped `🏷️ Титули` from `/hero`, owned title browsing, one active cosmetic title pointer, clear action, remort-count stale callback protection, safe archive rows and a separate no-power hero-card display.
- `0.2.11` Combat Balance and Monster Signature Proof: shipped a bounded generic monster stat-curve tune, selected class ability constant tightening and presentation-only monster signature lines for stored skill/telegraph ids in active cards, multi-enemy responses and journal replay, with no reward/economy/schema/title-power changes.
- `0.2.12` Two-Enemy Threat Simulation and Outlier Tuning: shipped deterministic one-enemy/two-enemy simulator modes with race aggregates, backup threat pressure guards and narrow tax-dragon/siege-varenyk/race guardrail tuning, with no reward/economy/schema/achievement changes.
- `0.2.13` Postal Manatka Delivery MVP: shipped `📮 Пошта Квестарні` for paid delivery of 1-5 distinct eligible `itemId` stack types, 1-93 units each, to known recipients from completed transfer history, with explicit recipient acceptance, no location/online leak, sender-paid send-time fee, postal custody while packages are pending, one-week pending packages, explicit bandage/tag-blocked manual package support, in-transit/history overview rows and all-or-nothing replay-safe package movement.
- `0.2.14` Adventure Quest Readability and Local Failure: shipped explicit `Замовник` / `Проблема` / `Ціль` selected-card copy and authored no-reward local failure for a small risky method slice.
- `0.2.15` Party Session Foundation: shipped dev/flagged temporary party recruiting with opaque `/start` links, nearby private invites, replay-safe leave/cancel/expiry, leader transfer and remort cleanup, but no boss combat or rewards.
- Combat variety: guard, cooldowns, monster skills, action catalog, item tags, one-use manatky.
- Remort follow-ups after the `0.1.2` base loop: remort-only advanced options, richer legacy flavor and future cosmetic/social records, without hidden wipe or power snowball.
- Threat escalation follow-up: broader tiers, Yeger/Adventure integration, location pools and reward scaling remain deferred beyond the `0.2.3` ordinary-only MVP; see `docs/tasks/archive/queued-threat-streak-multi-enemy-fights.md` as design input, not shipped scope.
- Party combat and real raids after duel/session/invite and multi-enemy primitives are proven, with capped contribution-aware rare/serious manatky rewards.

Done when:
- Гравець може потренуватися проти безпечної копії-допельґанґера перед викликом іншого гравця.
- Two players can complete an opt-in duel without reward duplication.
- Result/rematch cards are short, safe and useful in Telegram.
- Repeated/stale callbacks replay state instead of mutating it again.
- Social rewards are capped and do not create PvP/economy snowball.
- Remort follow-ups and raid reward paths are explicit, idempotent and do not create veteran runaway power.
- The data shape does not block later party combat, group raids, trading and gifting.
- The closeout smoke records that the shipped social-combat vertical slice has no blocker duplicate-reward, combat-lease, presence/privacy, remort-boundary or Shynok isolation regression.
- The accepted two-account regression/manual QA after `0.1.24` is referenced by the closeout docs.

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
- Postal/courier delivery shipped a first known-recipient package slice in `0.2.13`; future expansion must keep explicit delivery fees, recipient opt-in, privacy-safe recipient selection and the same reservation rules as safe gifting.
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

Very-later platform note:
- Повноцінний web-клієнт і боти для інших месенджерів на кшталт WhatsApp/Viber лишаються дуже далеким напрямом після стабілізації core loop, соціяльних систем і adapter boundaries. Це не частина `0.1.x` і не public promise.

## Backlog фіч
- Achievement follow-ups: add durable ledgers for bestiary/news/memorial/nearby/location-history/Yeger-trail and lifetime class/race/title ability-use records before adding long-term counters such as 42-use achievements; add internal aggregate achievement statistics so admins can see completion counts/percentages like level 10 reached by 5% of characters and level 23 by 0%, without exposing personal data or adding rewards. Shipped catalog: `docs/ACHIEVEMENTS_CATALOG.md`; historical planning note: `docs/ACHIEVEMENTS_PHASE1.md`.
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
- Бардівський виступ shipped in `0.2.5`: у `🍻 Шинку` навіть без інших пригодників або в будь-якій іншій поточній місцині з іншим активним пригодником, `93` хвилини cooldown на місцину, перевірка харизми/вдачі/рівня, малий capped house gold payout тільки в `🍻 Шинку`, voluntary applause/tips and no XP/items/buffs/profession engine. Future musical manatky or XP variants need their own task.
- Календарні корчемні дні: недільні/святкові гуляння, малі не-FOMO бонуси, київський час і середові жаби як власний квестарнянський мемний мотив.
- Player titles.
- Seasonal boss.
- Вісник ґільдії.
- Meme item generator with moderation.
- Рефералка без ігрових бонусів: запрошення для корчемного обліку, внутрішньої статистики й жартів у записах корчмаря про те, хто кого привів.
- Inline-bot виклики на драку для майбутнього соціяльного PvP: challenge card з інших чатів, але з opt-in, cooldowns і privacy guardrails.
- Moderation tools for group admins.
- Web dashboard for balancing.
- Very-later web play client and non-Telegram messenger adapters after the core bot architecture is stable.

## Не робити до стабільної альфи
- Real-money power.
- NFT/crypto/P2E.
- Складний auction house.
- Втрата предметів у PvP.
- 100 рівнів і 200 класів до перевірки core loop.
- Lore bible на 80 сторінок до першого playable build.
