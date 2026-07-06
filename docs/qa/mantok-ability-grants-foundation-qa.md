# Mantok Ability Grants Foundation QA

Manual Telegram QA status for the implementation pass: partial local smoke found and fixed gear-action routing, active-fight gear swaps, active overview refreshes and blocked gear-action buttons staying visible as no-op actions; full manual pass still pending.

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
2. Start a persistent fight and verify the gear-action button appears for currently equipped, level-eligible grants only when current mana/cooldown state allows pressing it.
2b. Leave and reopen the active fight card on a later turn, including in a two-enemy persistent fight; verify available gear-action buttons and bleed ticks survive the stored session JSON reload.
2a. During the same active turn, change equipment through the allowed side surface, return to the fight and verify newly equipped grant manatky add buttons while removed grant manatky stop working.
3. Use `🛡 Контраргумент`; verify it spends a turn, applies protection and does not create a class/race action.
4. Use `🩸 Червоний рядок` or `🖋 Остання сторінка`; verify bleed appears, ticks visibly and can finish combat without an extra status-kill response.
5. Use the borrowed Bard/Priest/Bureaucramancer/Varenyk/Drantohor/Molfar-style actions; verify they feel weaker than native class/race actions, consume mana/cooldown normally, hide while blocked, and return after enough real player turns clear the gate.
6. Replay an old gear callback after the turn advances; verify it is stale and does not spend mana, tick cooldowns, advance RNG or let the monster respond.
7. Start a Big Barrel Brother raid with an equipped eligible grant manatka; verify the gear button appears on the raid card, pressing it queues/resolves normally during the active raid, and the one-use shortcut is hidden when no useful one-use manatky are available.
8. Start a turn-based duel with an equipped eligible grant manatka; verify the gear button appears, pressing it queues/resolves during the active duel, and stale repeated gear callbacks do not advance the duel.
9. Equip duplicate copies if locally possible; verify only one grant is active.
10. Open item detail, `/equipment` and `/hero`; verify granted action/perk summaries are visible and readable, including the aggregate `Дія спорядження` row on equipment and character cards.
11. Verify `Єгерський плащ чужої справи` does not expose dense bandages, field kits or Yeger boards.
12. Win fights against configured source monsters and verify new grants can appear without removing existing trophy/coverage/set drops.
