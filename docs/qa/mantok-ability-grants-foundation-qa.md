# Mantok Ability Grants Foundation QA

Manual Telegram QA status for the implementation pass: partial local smoke found and fixed gear-action routing, active-fight gear swaps, active overview refreshes, blocked gear-action buttons hiding until usable, Big Barrel support effects starting cooldown without applying support, and corrupted party-boss gear callback notices; full manual pass still pending.

Review follow-up coverage:

- Automated service coverage confirms turn-based duel gear callbacks blocked by no mana or cooldown return the specific gate state without mutating the duel.
- Automated command coverage confirms those blocked duel gear callbacks answer with reason-specific callback notices.
- Automated keyboard coverage confirms the Big Barrel one-use item shortcut stays hidden unless the caller explicitly enables the item menu.
- Automated achievement coverage confirms committed persistent PvE, party-boss and turn-based duel gear-action events can reach the rewardless first-use achievement hook.
- Automated 0.2.31 regression coverage confirms Big Barrel Brother and turn-based duel committed gear-action unlocks are returned to the Telegram notification layer for the relevant participant cards.
- Automated turn-based duel service coverage confirms a queued gear action does not emit the first-use achievement until the round resolves, and dual committed gear actions emit events from the resolved round.
- Automated help/lore coverage confirms `/lore` opens the existing `📖 Перекази` board, is listed in `/help`, is not added to the side menu, and `🎒 Манатки` lore names visible `Дія спорядження`.
- Automated regression coverage confirms duplicate Big Barrel gear callbacks keep one queued action/effect/cooldown/achievement event, stale turn-based duel gear callbacks do not advance the duel, and ordinary two-enemy persistent fight gear actions write a committed gear summary while preserving readable multi-enemy state.
- Automated nearby-menu coverage confirms the `👀 Хто поруч` -> `🗡️ Тиха кишеня` callback opens the Rogue card, and unknown callback payloads answer with the existing invalid-button alert instead of leaving Telegram blinking silently.
- Automated keyboard coverage confirms an active Barrel card does not mark `⬅️ До зали` when the only outstanding quest marker is the Barrel tutorial step already available at the Barrel.
- Automated keyboard coverage confirms the Barrel tutorial accept result marks the direct `🛢️ До Бочки` route with `⚠️`.
- Automated callback coverage confirms Shynok problem-paper issue results rebuild quest markers after issue and mark `⬅️ До зали` when another Korchma-location quest is available.
- Automated service coverage confirms race-personalized adventure problem copy renders lowercase unquoted race forms such as `Портрет раси ельфа`.
- Automated content/economy coverage confirms high-enhancement generated manatky stay under the new soft `goldValue` cap while sale, level-exchange and Mantok Chest domain tests still pass.
- Automated balance/presenter coverage confirms persistent PvE remort monster pressure starts only after the third remort, keeps encounter levels stable, covers remorts `5`, `7` and `9` in one-enemy and two-enemy threat simulations, and labels solo Yeger pressure as `Відплата за минулі пригоди` without `Натиск Низу` wording.
- Automated service/repository coverage confirms Korchmar problem-chain counters count only wins from the current remort life, while preserving legacy zero-remort wins.
- Automated activity-event and presenter coverage confirms solo Barrel raid wins plus Big Barrel Brother group wins/losses render as raid rows in `⚔️ Бої`, with only group raid victories marked important.
- Automated keyboard/routing coverage confirms the persistent main menu places `🛡️ Спорядження` directly under `👤 Персонаж` and routes it to the existing equipment screen, including during active persistent fights.
- Automated quest-marker coverage confirms outside-Korchma `🚪 Зайти в корчму` gates stay unmarked without a verified active quest marker, including when the only cellar errand is on cooldown.
- Automated direct-command coverage confirms `/tavern` resolves fresh quest markers for the hall screen, so available Korchma quests keep `⚠️` when opened by command.

Manual Telegram evidence still required before merge:

- Pending: Big Barrel Brother duplicate gear action shows `Дію вже записано.` and refreshes the raid card without a second visible effect row.
- Pending: turn-based duel stale gear callback refreshes/replays the current card without advancing the duel.
- Pending: ordinary two-enemy persistent fight gear action keeps the active card and `📜 Журнал бою` readable after the committed gear turn.
- Pending live evidence: first committed gear action shows the achievement notification once in Telegram, while repeated/stale/blocked callbacks do not. Automated 0.2.31 coverage now pins the service-to-Telegram notification bridge.
- Pending: `/lore` opens `📖 Перекази Квестарні` on the local bot and remains absent from the Telegram side command menu.
- Pending: after taking `Бочка, або Туди і звідти`, the live accept result card shows `🛢️ До Бочки ⚠️`.
- Pending: after taking a Korchmar problem paper from Shynok while another Korchma-location quest is available, the live result card shows `⬅️ До зали ⚠️`.
- Pending: a race-personalized adventure result card uses lowercase unquoted race copy, e.g. `Портрет раси ельфа`.
- Pending: remort `7+` Yeger fight card shows `Відплата за минулі пригоди` on the intro and active card; ordinary two-enemy threat fights still use `Натиск Низу`.
- Pending: after remort, taking or checking `Тринадцять дрібних проблем` shows only current-life progress, not old counts such as `139/13`.
- Pending: after one solo Barrel raid completion and one Big Barrel Brother win/loss, `📜 Хроніки Квестарні` shows the raid rows under `⚔️ Бої`; `⭐ Важливе` shows the group victory only.
- Pending: the live persistent main menu shows `🛡️ Спорядження` directly under `👤 Персонаж`, and tapping it opens `🧥 Спорядження`.
- Pending: from outside the Korchma with only the cellar on cooldown, `/fight` shows `🚪 Зайти в корчму` without `⚠️`.
- Pending: from inside the Korchma with an available hall quest, `/tavern` shows `📋 Стіл зі справами ⚠️` or the matching available location button with `⚠️`.

1. Seed or win one grant manatka in each slot and equip it on a level-appropriate character. Locally, use `/dev_add_item itemId=<item.id>` for exact QA grants.
   - Combat-action QA ids:
     - `item.set.barrel-brother.shield` — level `9+`.
     - `item.set.red-line.left-dagger` — level `10+`.
     - `item.ability.last-page-rapier` — level `13+`.
     - `item.set.couplet.harp` — level `10+`.
     - `item.set.asclepius.staff` — level `11+`.
     - `item.set.form13bis.seal` — level `11+`.
     - `item.set.siege-filling.ladle` — level `12+`.
     - `item.set.border-map.compass` — level `12+`.
     - `item.set.fog-knot.amulet` — level `11+`.
   - Service-perk-only QA id: `item.set.yeger-shadow.cloak` — level `12+`; it should show copy but no combat button.
2. Start one-enemy and two-enemy persistent fights and verify the gear-action button appears for currently equipped, level-eligible grants only when current mana/cooldown state allows pressing it, then hides while mana/cooldown gates block the action.
3. During the same active turn, change equipment through the allowed side surface, return to the fight and verify newly equipped grant manatky add buttons while removed grant manatky stop working.
4. Leave and reopen the active fight card on a later turn, including in a two-enemy persistent fight; verify available gear-action buttons and bleed ticks survive the stored session JSON reload.
5. Use `🛡 Контраргумент`; verify it spends a turn, applies protection, writes the protection effect on the fight card and in the relevant journal/replay, and does not create a class/race action.
6. Use `🩸 Червоний рядок` or `🖋 Остання сторінка`; verify bleed appears, ticks visibly in single- and multi-enemy fights, writes to `📜 Журнал бою`, and can finish combat without an extra status-kill response.
7. Use the borrowed Bard/Priest/Bureaucramancer/Varenyk/Drantohor/Molfar-style actions; verify they feel weaker than native class/race actions, apply damage/support, write the effect on the card and in the relevant journal/replay, consume mana/cooldown normally, hide while blocked, and return after enough real player turns clear the gate.
8. Replay an old persistent-fight gear callback after the turn advances; verify it is stale and does not spend mana, tick cooldowns, advance RNG or let the monster respond.
9. Start a Big Barrel Brother raid with an equipped eligible grant manatka; verify the gear button appears on the raid card, pressing it queues/resolves normally during the active raid, applies damage/support before boss retaliation, writes the effect to the active card and `📜 Журнал`, and the one-use shortcut is hidden when no useful one-use manatky are available.
10. In the Big Barrel raid, verify boss gear callbacks parse/build correctly, stale or missing-grant callbacks do not mutate, duplicate gear callbacks show `Дію вже записано.`, cooldown/mana gates hide blocked buttons, and active-combat redirects preserve refresh, item menu, item-use and gear shortcuts.
11. Start a turn-based duel with an equipped eligible grant manatka; verify the gear button appears, pressing it queues/resolves during the active duel, writes damage/support to the stored round replay, and stale repeated gear callbacks do not advance the duel.
12. In the turn-based duel, verify gear callbacks parse/build correctly, stale-turn and missing-grant callbacks are stale, cooldown/mana gates hide blocked buttons, support/heal effects show in replay/result presentation, and quick duels remain instant without gear actions.
13. Equip duplicate copies if locally possible; verify only one grant is active.
14. Open item detail, `/equipment` and `/hero`; verify granted action/perk summaries are visible and readable, including the aggregate `Дія спорядження` row on equipment and character cards.
15. Use the first successful gear action on a character that has not earned `Манатка натиснула кнопку`; verify the achievement notification appears once, then repeat/stale/blocked callbacks do not repeat it.
16. Run `/lore`; verify it opens `📖 Перекази Квестарні`. Open `🎒 Манатки`; verify the copy says rare manatky can grant visible `Дія спорядження` and does not imply hidden procs.
17. Verify `Єгерський плащ чужої справи` does not expose dense bandages, field kits or Yeger boards.
18. Win fights against configured source monsters and verify new grants can appear without removing existing trophy/coverage/set drops.
