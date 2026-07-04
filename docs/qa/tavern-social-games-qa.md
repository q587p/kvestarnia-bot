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
- Legacy Kosti join/style/sign callbacks refund or fail closed without accepting the old table action.
- Completed Dice Poker quick win/loss/draw and high scorecard completion count in the tavern-games leaderboard.
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
- Kosti opens `🎲 Кості й покер` with `⚡ Швидкий покер`, `📜 Табличний покер` and `❔ Правила`.
- Quick Dice Poker supports selecting none/some/all dice for the one reroll and shows both final hands plus the reason.
- Scorecard mode shows turn, roll, selected dice, score preview buttons and scorecard summary.
- Scorecard used boxes disappear from available score buttons.
- Scorecard can continue after the quick-poker decision window and still expires/refunds after its longer deadline.
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
5. Start quick poker; test no reroll, some rerolled dice and all dice rerolled across attempts.
6. Verify win/loss/draw/refund-cap result copy and stake behavior.
7. Start scorecard mode; reroll selected dice twice, score boxes and verify used boxes disappear.
8. Keep a scorecard session open past the quick-poker window, press a valid scorecard action and verify the game continues.
9. Let a scorecard session pass its longer deadline and verify a single escrow refund.
10. Finish all 13 scorecard turns or use local setup to drive a terminal scorecard.
11. Verify `🏆 Рейтинг` counts quick win/loss/draw and high scorecard completion.
12. Press stale old Kosti join/decision/resolve buttons and stale dice-poker buttons after completion/expiry.
13. Try insufficient gold.
14. Try create/join/decision while under combat lock.
15. Run the repo's local checks, at minimum `npm run check` if available.
16. Inspect DB rows for terminal statuses and no orphan escrow.
