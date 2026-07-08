# Duel Tournaments

Turn-based duel tournaments are a Korchma-funded recognition layer over the existing turn-based duel system.

They do not introduce a new combat engine. Tournament standings read resolved duel records produced by the existing duel settlement and replay flow.

## Periods

- Daily: fixed Kyiv calendar day.
- Weekly: fixed Kyiv ISO week.
- Monthly: fixed Kyiv calendar month.

Cards show the active period, current standings, the player's points/rank, time remaining, previous winners and pending Korchma prize chests.

Unclaimed reward lookback is bounded:

- Daily: 13 closed daily periods.
- Weekly: 8 closed weekly periods.
- Monthly: 5 closed monthly periods.

Each pending chest remains independently claimable from the tournament screen while it is inside that lookback window.

Stored period keys may remain Gregorian for repository/callback stability, but player-facing tournament cards must render period keys as Holocene dates: `12026-07-08`, `12026-W28`, `12026-07`.

## Counting Rules

Only resolved turn-based duels count.

Excluded:

- quick duels;
- Rogue retaliation quick duels;
- training fights;
- cancelled, declined, expired or stale sessions;
- developer helper fights.

Each duel record contributes at most once. Old duel card replays do not create new records and cannot create another tournament result.

## Points And Anti-Boost

Scoring is deterministic:

- first win by the same player against the same opponent in one period: 3 points;
- second win by the same player against the same opponent in one period: 1 point;
- later wins against that same opponent in that period: 0 tournament points;
- first draw against the same opponent in one period: 1 point for each player;
- later draws against that same opponent in that period: 0 tournament points.

This keeps recognition possible for normal rematches while making easy same-pair farming unattractive.

## Rewards

Rewards are paid by Korchma as manually claimed prize chests, never by another player and never through Postal Delivery.

Only top-three placements with positive points can claim. The reward snapshot is stored with the claim, so future balance changes or repeated callbacks do not recalculate or duplicate rewards.

Current reward table:

- Daily: 42/23/13 gold plus 5/3/1 `Бинт відповідальної паніки`.
- Weekly: 93/42/23 gold plus 5/3/1 `Щільний бинт`.
- Monthly: 587/93/42 gold plus 3/2/1 `Польова аптечка`.

The loop stays bounded and uses existing medical manatky instead of player-funded prizes.

## Public Recognition

`📜 Хроніки Квестарні` shows successful tournament reward claims as important period recognition. Tournament losses are not published.

Completed quick and turn-based duels may appear separately as neutral `⚔️ Бої` rows without naming a public loser.
