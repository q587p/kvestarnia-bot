# Tavern Social Games design

This document defines the MVP rules for the tavern table games.

## Shared concepts

### Stakes and pot

- All participants in one table use the same stake.
- Stake is reserved on create/join, not at resolve time.
- The game never creates house money. Winners receive only reserved pot gold.
- Refund paths return reserved stakes.
- Optional fees should be omitted for MVP unless the project already has a standard tavern fee pattern.

### Randomness

- Store a stable session seed when creating the session.
- Resolvers must be deterministic for the same seed, session, participants, and decisions.
- Tests should use fixed seeds.

### Decisions

Each game asks for at most one small decision per player in MVP:

- Tavlei: one tactic.
- Kosti: one style and one sign.

Missing decisions after timeout should use safe defaults rather than orphaning escrow.

## Tavlei

### Fantasy

Tavlei is a tavern board game with pieces, dice, old scratches, and a reputation for clever players. It is not a full board game in MVP; it is a compact duel where planning and reading the opponent matter more than animation or move-by-move play.

### Format

- Players: exactly 2.
- Stake: equal stake from both players.
- Choice: one tactic per player.
- Result: win, loss, or draw/refund.
- Timing: creator waits for opponent; after both joined, both choose tactic or get defaulted on timeout.

### Tactics

| Key | Ukrainian label | UI meaning | Matchup role |
| --- | --- | --- | --- |
| `careful_defense` | Обачна оборона | Do not hurry; cover weak points. | Beats quiet trap; weak into long game. |
| `quiet_trap` | Тиха пастка | Let the opponent feel ahead. | Beats sharp opening; weak into careful defense. |
| `sharp_opening` | Гострий дебют | Break the position quickly. | Beats long game; risky into quiet trap. |
| `long_game` | Довга партія | Win through patience. | Beats careful defense; weak into sharp opening. |

Default tactic: `careful_defense`.

### Tavlei scoring

Recommended formula:

```ts
score = roll2d10(seed, participantId)
  + intValue * 1.8
  + luckValue * 0.6
  + tacticMatchupBonus(myTactic, opponentTactic)
  + smallLevelNudge;
```

`smallLevelNudge` should be absent or small enough that low-level players still have a real chance:

```ts
smallLevelNudge = Math.min(3, Math.floor(character.level / 5));
```

Draw threshold:

```ts
if (Math.abs(scoreA - scoreB) <= 1) drawAndRefund();
```

### Tavlei matchup matrix

```ts
const tavleiMatchup = {
  careful_defense: {
    careful_defense: 0,
    quiet_trap: +4,
    sharp_opening: -2,
    long_game: -4,
  },
  quiet_trap: {
    careful_defense: -4,
    quiet_trap: 0,
    sharp_opening: +5,
    long_game: -2,
  },
  sharp_opening: {
    careful_defense: +2,
    quiet_trap: -5,
    sharp_opening: 0,
    long_game: +5,
  },
  long_game: {
    careful_defense: +4,
    quiet_trap: +2,
    sharp_opening: -5,
    long_game: 0,
  },
};
```

### Tavlei result rendering

Show:

- both players and their tactics;
- short narrative based on the matchup;
- winner and payout, or draw/refund;
- no raw formula/debug values in player-facing text.

## Kosti

### Fantasy

Kosti is louder, faster, and less noble. It is a small group table where players push luck, chase a sign, or try to keep a steady hand.

### Format

- Players: 2-7.
- Stake: equal stake from each player.
- Choice: one style and one sign.
- Dice: 5d6 per player.
- Result: best hand wins the main pool; sign winners split the sign pool.

### Pot split

```text
totalPot = stake * participantCount
mainPool = floor(totalPot * 0.70)
signPool = totalPot - mainPool
```

Rules:

1. Best scored hand wins `mainPool`.
2. Players whose chosen sign is true split `signPool`.
3. If no sign is true, `signPool` goes to the main winner.
4. Remainders from integer division go to the main winner.
5. Total payouts must equal `totalPot`.

### Styles

| Key | Ukrainian label | UI meaning | MVP effect |
| --- | --- | --- | --- |
| `steady` | Тримати руку | No heroics; modest but safe. | `+2` score if rank is below triple. |
| `push` | Гнати банк | Throw loud and hard. | `+3` for triple+ or sum >= 22; `-4` for high-card/pair only. |
| `sign_hunter` | Ловити знак | Not the biggest hand, the right one. | `-2` main score; `+1` sign split priority/tiebreak if needed. |

Default style: `steady`.

### Signs

| Key | Ukrainian label | Condition | Approx. frequency | Role |
| --- | --- | --- | ---: | --- |
| `two_pairs` | Дві пари | counts are `[2, 2, 1]` | ~23.15% | safer sign |
| `triple` | Трійня | max count >= 3 | ~21.30% | strong sign |
| `high_hand` | Висока рука | sum >= 22 | ~15.20% | risky sum sign |
| `straight` | Шлях | set is `1..5` or `2..6` | ~3.09% | rare sign |
| `tower` | Вежа | max count >= 4 | ~2.01% | rare sign |
| `no_sign` | Без знаку | never wins sign pool | n/a | safe default if UX needs it |

Recommended default sign: `high_hand` for a more exciting default, or `no_sign` if the project prefers explicit opt-in side bets.

### Hand ranking

Higher is better:

```ts
fiveKind:   700 + face * 10
straight:   650 + highEnd
fourKind:   600 + face * 10 + kicker
fullHouse:  550 + tripleFace * 10 + pairFace
triple:     500 + face * 10 + kickersSum
twoPairs:   400 + highPair * 10 + lowPair + kicker
pair:       300 + pairFace * 10 + kickersSum
high:       100 + sum
```

Then apply style modifiers:

```ts
if (style === 'steady' && rank < 500) score += 2;
if (style === 'push' && (rank >= 500 || sum >= 22)) score += 3;
if (style === 'push' && rank < 400) score -= 4;
if (style === 'sign_hunter') score -= 2;
```

Tie-break order:

1. Higher final score.
2. Higher raw rank.
3. Higher dice sum.
4. Highest single die.
5. Stable seeded participant order.

### Kosti result rendering

Show:

- each participant's style, dice, and hand label;
- main pool winner and payout;
- sign pool winners and payout, or note that the main winner takes unused sign pool;
- short colorful text, not formulas.

## Future extensions, not MVP

- rematch buttons;
- low-stake tavern tournaments;
- suspicious throw / cheating flavor without real exploit risk;
- spectator reactions without betting;
- NPC tutorial with no meaningful payout;
- titles or rumors after win streaks.
