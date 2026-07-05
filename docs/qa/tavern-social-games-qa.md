# Tavern Social Games QA

## Unit tests: Tavlei resolver

- Equal stats with fixed seed returns a stable result.
- Missing tactic uses `careful_defense`.
- Matchup bonuses apply in both directions.
- Draw threshold triggers draw/refund result.
- Winner payout equals full pot.
- Draw refunds both stakes.
- Same seed/session/decisions produce the same result.
- Player-facing result contains tactic labels but no raw formula details.

## Unit tests: Dice Poker / Kosti

- Quick hand ranking order: poker > four of a kind > full house > large straight > small straight > triple > two pairs > pair > high die.
- Five/four/three of a kind tie-break by grouped face then kickers.
- Full house tie-breaks by triple value, then pair value.
- Large straight beats small straight.
- Pair and two-pair tie-breaks use pair values before kickers.
- Exact equal evaluated hands draw.
- Exact quick draws create a deciding round and cap at three repeated draws before refund.
- NPC reroll heuristic keeps made hands, triples, two pairs, pairs, four-card straight candidates or the highest die.
- Scorecard upper boxes, lower boxes, chance and upper bonus match the simplified rules.
- Five of a kind is `Покер` but not simplified `Фул-хаус`.
- Scorecard cannot score a used category and cannot reroll past the third roll.
- Scorecard sessions use a longer deadline than quick poker and valid state changes refresh it.

## Unit tests: economy and state

- Create fails if stake exceeds gold.
- Join fails if stake exceeds gold.
- Create subtracts creator stake exactly once.
- Join subtracts participant stake exactly once.
- Duplicate create/join/decision callbacks are idempotent or return current state.
- Resolve pays exactly once.
- Re-resolving a completed session does not mutate gold.
- Dice Poker completion pays/refunds at most once.
- Dice Poker cancel and expiry return reserved stake once.
- Tavlei vs Doppelganger reserves one player stake, returns/refunds it at most once on win/draw/expiry and loses it safely on loss.
- Legacy Kosti join/style/sign callbacks refund or fail closed without accepting the old table action.
- Completed Dice Poker quick win/loss/draw and high scorecard completion count in the tavern-games leaderboard.
- Social Dice Poker quick tables settle two participants once and social scorecard tables settle 2-8 participants once.
- Cancel before another participant joins refunds creator.
- Expired open session refunds participants.
- Failed resolve path safe-refunds and reaches terminal state.
- A participant cannot join the same session twice.
- A player cannot join their own 1v1 Tavlei table.
- One active stake session limit is enforced.

## Integration tests: Telegram flow

- Tavern menu shows `🎲 Ігри за столом` when feature flag is enabled.
- Feature is hidden or disabled when the global flag is off.
- Open table list excludes completed/refunded sessions.
- Tavlei moves to `READY` when the second player joins.
- Tavlei decision buttons work and stale decision callbacks are friendly.
- Kosti opens `🎲 Кості й покер` with `⚡ Швидкі кості`, `📜 Табличні кості` and `❔ Правила`, with stakes shown only after choosing a mode.
- `🎲 Ігри за столом` shows current gold, a short Doppelganger availability paragraph and a separate `🪞 Допельґанґер` branch when he is in Shynok.
- Quick Dice Poker supports a two-player social table, auto-starts when the second player joins, shows each participant their own dice/card, supports selecting none/some/all dice for the one reroll and reaches a terminal shared result once both players finish.
- Social Dice Poker terminal results are pushed to the other seated participants with active titles, bold payout/refund amounts and rematch/back controls; closed-table callbacks do not show old reroll/score buttons.
- Waiting Tavlei, quick-dice and scorecard-dice tables expose invite controls: a rotating invite-card button plus a Telegram share deep link that joins the same table through `/start game_...`.
- Open and ready Tavlei table cards separate title, players, bank and next action with blank lines, and show seated character names in bold with active cosmetic titles.
- Invite-link join failures for non-participants keep the table retry path visible: insufficient-gold responses show `✅ Сісти за стіл`, not creator-only invite buttons.
- `🪞 Допельґанґер` is available in Shynok from 23:00 until 07:00 Kyiv time, opens a separate game choice, and supports quick dice, scorecard dice and Tavlei.
- Active games against `🪞 Допельґанґер` appear in `🎲 Ігри за столом` and `👀 Хто поруч` as occupied tables without join buttons.
- Completed Dice Poker games against `🪞 Допельґанґер` replay their stored result and `🔁 Зіграти ще` starts the same fallback game without old Kosti stale-copy.
- Quick Dice Poker with `🪞 Допельґанґер` shows both final hands plus the reason.
- Tavlei with `🪞 Допельґанґер` shows tactic choices, settles after the player choice and records the result without a second participant row.
- Dice Poker rules opened from an active game can return to that same active game.
- Scorecard mode manual start notifies seated participants and shows each participant their own turn, roll, selected dice, score preview buttons and scorecard summary.
- Scorecard used boxes disappear from available score buttons.
- Scorecard can continue after the quick-poker decision window and still expires/refunds after its longer deadline.
- Scorecard social tables whose join window expires refund once through the Dice Poker expiry result, even if stale join/resolve callbacks are replayed.
- Stale join/decision/resolve callbacks return friendly messages.
- Insufficient gold path is friendly and does not create a session.
- Combat lock blocks create/join/submit actions according to existing project policy.

## Concurrency tests

- Two players attempt the last Kosti seat: only one succeeds.
- Two resolve calls race: only one payout occurs.
- Expiration/refund and manual resolve race: terminal state is unique and gold is correct.
- Player attempts to join two active stake sessions at once: second action fails.

## Manual smoke checklist

1. Enable feature flags locally.
2. Create Tavlei with 1 gold, cancel before opponent, verify refund.
3. Create Tavlei with 1 gold, join as another user, choose tactics, verify result and ledger.
4. Open `🎲 Кості`; verify `🎲 Кості й покер` explains quick and scorecard modes.
5. Verify the first Kosti card shows mode buttons before stakes.
6. Verify `🎲 Ігри за столом` shows your current gold and a short Doppelganger paragraph.
7. Pick `⚡ Швидкі кості`, choose a stake and open a social table.
8. On the waiting quick table press `📣 Запрошення до столу`; verify the invite card appears, `🎲 Інший текст` rotates copy, and `🔗 Запросити до столу` opens Telegram share.
9. Open the invite deep link from a second account; verify the table auto-starts and both accounts see their own dice/card and controls.
10. Repeat invite-card and deep-link checks for an open Tavlei table and an open `📜 Табличні кості` table; verify Tavlei waiting/ready cards have blank lines between blocks and bold titled player names.
11. Press stale invite-card rotation/share buttons after a table starts or closes; verify a friendly stale answer, no stake mutation and no reroll/score buttons on closed tables.
12. Open an invite deep link from a second account without enough gold; verify the card says gold is missing and shows `✅ Сісти за стіл` plus `↩ До ігор`, then sell manatky for enough gold and press `✅ Сісти за стіл` to join the same table.
13. Test no reroll, some rerolled dice and all dice rerolled across quick attempts.
14. Verify social quick completion settles one shared pot once, pushes the terminal result to the first player, separates player result rows with blank lines and appears in `🏆 Рейтинг`.
15. From 23:00 until 07:00 Kyiv time, open `🪞 Допельґанґер`; verify it offers quick dice, scorecard dice and Tavlei before stake choice.
16. Start quick dice with `🪞 Допельґанґер`; verify win/loss/draw/refund-cap result copy, blank-line spacing and exact stake behavior.
17. Start Tavlei with `🪞 Допельґанґер`; choose a tactic, verify win/draw/loss stake behavior and rating result.
18. While a game with `🪞 Допельґанґер` is active, verify it appears in `🎲 Ігри за столом` and `👀 Хто поруч` as an occupied table and does not show `✅ Сісти за стіл`.
19. Outside 23:00-07:00 Kyiv time, verify Shynok hides the `🪞 Допельґанґер` branch, `/spar` works from the fighting corner and stale direct fallback callbacks do not reserve a stake.
20. At 23:00-07:00 Kyiv time, verify the fighting corner hides `🥊 Потренуватися` and `/spar` says the Doppelganger went to Shynok.
21. Open rules from the active game and return to the same active game.
22. Start `📜 Табличні кості` as a social table; join from at least one more account, press `▶️ Почати партію`, and verify every account receives its own scorecard state and controls.
23. Reroll selected dice twice, score boxes and verify used boxes disappear.
24. Keep a scorecard session open past the quick-poker window, press a valid scorecard action and verify the game continues.
25. Let an unstarted scorecard table pass its join window, press stale join/resolve callbacks and verify one Dice Poker escrow refund with no legacy Kosti result.
26. Let a started scorecard session pass its longer deadline and verify a single escrow refund.
27. Let unresolved Tavlei vs Doppelganger expire and verify a single escrow refund.
28. Finish all 13 scorecard turns or use local setup to drive a terminal scorecard.
29. Verify `🏆 Рейтинг` counts quick win/loss/draw, Tavlei vs Doppelganger and high scorecard completion.
30. Press `🔁 Зіграти ще` from a completed social table and verify a new same-stake table opens for the actor while the previous opponent receives a private join invite.
31. Press duplicate rematch callbacks and verify there is no duplicate table or duplicate invite while the actor has an active stake session.
32. Press `🔁 Зіграти ще` from a completed Doppelganger game and verify the same fallback path starts directly without inviting another player or showing old Kosti stale-copy.
33. Replay the completed Doppelganger result card and verify it still shows the Dice Poker result.
34. Create a table, close or finish it, then immediately create another table; verify there is no recent-create cooldown blocker.
35. Verify open social Dice Poker table counts in `🎲 Ігри за столом`.
36. Press stale old Kosti join/decision/resolve buttons and stale dice-poker buttons after completion/expiry.
37. Try insufficient gold.
38. Try create/join/decision while under combat lock.
39. Run the repo's local checks, at minimum `npm run check` if available.
40. Inspect DB rows for terminal statuses and no orphan escrow.
