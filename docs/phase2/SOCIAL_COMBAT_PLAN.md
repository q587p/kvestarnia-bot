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
- **Character matters.** Рівень, раса, клас, стати й спорядження можуть впливати на odds/flavor, але не створюють гарантованої перемоги.
- **Funny before competitive.** Дуелі мають давати історії й жарти, а не тільки win/loss.
- **No snowball.** Нагороди за соціяльні бійки capped, cosmetic/social або дуже малі; перемога не робить наступну перемогу автоматичною.
- **Composability.** Те, що будуємо для дуелей, має пізніше допомогти trading, gifting, party combat і raids.

## Phase 2 order

1. **Duel invite MVP.** Challenge row, accept/decline/expire, quick resolve, replay-safe result.
2. **Result/rematch/tournament cards.** Compact share card, rematch button, small daily/weekly recognition without power creep.
3. **Trading/gifting MVP.** Передати одну eligible манатку або stack-unit іншому гравцю з explicit confirmation and audit row.
4. **Combat variety.** Guard, cooldowns, monster skills, class/race/action catalog, item tags and one-use manatky.
5. **Remort at 13.** `/remort` as prestige loop with cosmetic/social legacy, not paid power and not a hidden wipe.
6. **Multi-enemy combat.** Main enemy plus controlled helper/summon pattern, compact UI, no doubled reward faucet.
7. **Party combat / real raids.** Only after duel/session/invite, multi-actor and multi-enemy shapes are proven.

## Non-goals for the first Phase 2 slices

- no guild wars;
- no auction house;
- no item loss in PvP;
- no wagers in the first duel MVP;
- no paid power;
- no giant raid engine before small social sessions work;
- no Mini App requirement;
- no exact hidden formulas in player-facing text.

## Required docs before runtime work

- [DUELS_AND_INVITES.md](DUELS_AND_INVITES.md)
- [TRADING_AND_GIFTING.md](TRADING_AND_GIFTING.md)
- [ITEM_TAGS_AND_CONSUMABLES.md](ITEM_TAGS_AND_CONSUMABLES.md)
- [UNSTABLE_BALANCE_PRINCIPLES.md](UNSTABLE_BALANCE_PRINCIPLES.md)

Runtime PRs should name which slice they implement and what they explicitly leave out.

