# Mantok Ability Grants Foundation QA

Manual Telegram QA status for the implementation pass: partial local smoke found and fixed hidden blocked gear-action buttons after equipping a grant manatka; full manual pass still pending.

1. Seed or win one grant manatka in each slot and equip it on a level-appropriate character. Locally, use `/dev_add_item itemId=<item.id>` for exact QA grants.
2. Start a persistent fight and verify the gear-action button appears only for frozen eligible grants, including when current mana/cooldown state blocks pressing it.
3. Use `🛡 Контраргумент`; verify it spends a turn, applies protection and does not create a class/race action.
4. Use `🩸 Червоний рядок` or `🖋 Остання сторінка`; verify bleed appears, ticks visibly and can finish combat without an extra status-kill response.
5. Use the borrowed Bard/Priest/Bureaucramancer/Varenyk/Drantohor/Molfar-style actions; verify they feel weaker than native class/race actions, consume mana/cooldown normally and reject blocked presses without advancing combat.
6. Replay an old gear callback after the turn advances; verify it is stale and does not spend mana, tick cooldowns, advance RNG or let the monster respond.
7. Equip duplicate copies if locally possible; verify only one grant is active.
8. Open item detail and `/equipment`; verify granted action/perk summaries are visible and readable.
9. Verify `Єгерський плащ чужої справи` does not expose dense bandages, field kits or Yeger boards.
10. Win fights against configured source monsters and verify new grants can appear without removing existing trophy/coverage/set drops.
