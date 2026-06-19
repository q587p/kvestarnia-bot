# Phase 2 — Social Combat & Interactions

Phase 2 не починається з «великого рейду на всіх». Після Phase 1 у Квестарні вже є персонаж, HP/мана, покроковий solo-бій, манатки, присутність і перші корчемні surface-и. Наступний корисний стрибок — зробити гру соціяльною через короткі opt-in взаємодії, які добре живуть у Telegram.

Робоча назва Phase 2: **Social Combat & Interactions**.

## Product promise

Гравець має отримати причину сказати іншому гравцю: «натисни, буде смішно». Це не має бути примус, pay-to-win, токсичне PvP або таблиця сорому.

Перший hook:

1. Кинути дружній виклик на дуель.
2. Прийняти його явною кнопкою.
3. Побачити короткий результат.
4. Отримати картку, яку хочеться показати.
5. Мати природний шлях до реваншу, серії або маленького турнірного шуму.

## Pillars

- **Opt-in first.** Ніяких автоматичних нападів, крадіжки золота, втрати манаток або покарання за відмову.
- **Telegram-native.** Коротке повідомлення, зрозуміла кнопка, shareable result card, мінімум довгих меню.
- **Character matters.** Рівень, раса, клас, титул/earned identity, стати, спорядження й item tags можуть впливати на odds/flavor, але не створюють гарантованої перемоги.
- **Funny before competitive.** Дуелі мають давати історії й жарти, а не тільки win/loss.
- **No snowball.** Нагороди за соціяльні бійки capped, cosmetic/social або дуже малі; перемога не робить наступну перемогу автоматичною.
- **Composability.** Те, що будуємо для дуелей, має пізніше допомогти trading, gifting, party combat і raids.

## Phase 2 order

1. **Pre-duel training doppelganger.** `0.1.5` adds level 3+ `/spar` / `🥊 Бійцівський куток`: a turn-based XP-only training fight against a bot-owned mirror copy, with no target player, duel ledger, gold/items/manatky rewards, quest progress, wager, rank or title yet. It reuses solo combat sessions for the local fight state but is explicitly excluded from ordinary `/fight` quest counting.
2. **Duel invite MVP.** `0.1.10` ships the first rewardless ledger: level 3+ challenge row, accept/decline/cancel/expire, generated deep links, quick resolve and replay-safe result. `0.1.11` adds rematches/share cards, `0.1.17` renames the quick mode to `⚡ Миттєва дуель`, and `0.1.18` adds `♟️ Покрокова дуель` with persistent two-player session state, leases, 23-second turns and shared combat-domain actions. It still has no rewards, rating, wagers, item loss or tournament state.
3. **Result/rematch/tournament cards.** Compact share card and mode-preserving rematch are shipped; small daily/weekly recognition without power creep remains future, and tournament/rating power waits until the rewardless duel loop is proven.
4. **Trading/gifting MVP.** Передати одну eligible манатку або stack-unit іншому гравцю з explicit confirmation and audit row.
5. **Combat turn timeout.** Turn-based duels now use the first durable 23-second turn timeout path with idempotent auto-attacks. Ordinary monster fights and `/spar` can reuse the same model later instead of relying only on long-session expiry.
6. **Combat variety.** Guard, cooldowns, monster skills, class/race/action catalog, item tags and one-use manatky.
7. **Remort follow-ups.** The base `/remort` loop shipped in `0.1.2`; future Phase 2 work can add remort-only flavor/options without paid power, hidden wipes or veteran snowball.
8. **Multi-enemy combat.** Main enemy plus controlled helper/summon pattern, compact UI, no doubled reward faucet.
9. **Party combat / real raids.** Only after duel/session/invite, multi-actor and multi-enemy shapes are proven.

## Non-goals for the first Phase 2 slices

- no guild wars;
- no auction house;
- no item loss in PvP;
- no wagers in the first duel MVP;
- no paid power;
- no giant raid engine before small social sessions work;
- no Mini App requirement;
- no exact hidden formulas in player-facing text.

## Result inputs

Social-combat results may depend on:

- level bracket;
- race;
- class;
- current title, earned identity or future achievement title;
- stats and shared effective stats;
- equipment and item tags;
- bounded randomness.
- synced current resources through a small capped readiness effect.

The goal is not sterile symmetry. A class, race, title or carried/equipped manatka should sometimes create a funny upset, as long as caps and logs prevent abuse loops.

For duels, level/remort progression may be temporarily normalized before scoring or session start. Identity and equipment should not be copied, averaged or erased; the normalization only prevents progression gap from becoming the whole result. Turn-based sessions freeze the accepted snapshots so later equipment, remort or rename changes do not mutate the active or replayed fight.

## Required docs before runtime work

- [DUELS_AND_INVITES.md](DUELS_AND_INVITES.md)
- [TRADING_AND_GIFTING.md](TRADING_AND_GIFTING.md)
- [ITEM_TAGS_AND_CONSUMABLES.md](ITEM_TAGS_AND_CONSUMABLES.md)
- [UNSTABLE_BALANCE_PRINCIPLES.md](UNSTABLE_BALANCE_PRINCIPLES.md)

Runtime PRs should name which slice they implement and what they explicitly leave out.
