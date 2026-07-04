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
- Dice Poker Kosti: selected dice to reroll and, in scorecard mode, one unused score box per turn.

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

### Table rating

The Shynok games hub exposes a read-only table-games rating for completed sessions:

- windows: last day, last week and last month;
- rows: wins, draws and losses;
- scope: both Tavlei and Kosti;
- Tavlei draw counts as a draw for both players;
- Dice Poker Kosti is solo/NPC in `0.2.26`; wins/losses/draws are recorded from terminal session outcome and grant no reward power;
- the rating grants no XP, gold, items, power or extra rewards.

## Kosti

### Fantasy

Kosti now routes to Dice Poker. The old 2-7 player style/sign table from `0.2.21` is legacy-compatible only: old rows may be safely refunded when touched, but new player-facing keyboards should not expose style/sign choices.

### Quick Dice Poker Format

- Players: one player vs tavern opponent.
- Stake: one escrowed stake from the player.
- Dice: 5d6 per side.
- Choice: player may reroll any subset once, including none.
- Opponent: deterministic reroll heuristic from visible dice.
- Result: strongest five-dice poker hand wins; exact equal hand starts a deciding round, capped at three repeated draw rounds before refund.

Hand ranking:

```text
Покер
Каре
Фул-хаус
Великий стріт
Малий стріт
Трійка
Дві пари
Пара
Старша кістка
```

Tie-breakers:

- five/four/three of a kind: grouped face first, then kickers;
- full house: triple value, then pair value;
- straights: 6-high beats 5-high;
- two pairs: high pair, low pair, kicker;
- pair: pair value, kickers descending;
- high dice: all dice descending.

### Scorecard Dice Poker Format

- Solo 13-turn scorecard.
- Each turn starts with 5d6.
- Up to two selected-dice rerolls after the initial roll.
- After stopping or after the third roll, the player scores one unused box.
- Score previews are visible for unused boxes.
- No joker rules and no extra poker bonus chains.

Upper boxes:

- `Одиниці`, `Двійки`, `Трійки`, `Четвірки`, `Пʼятірки`, `Шістки`.
- Upper bonus: `+35` if upper total is at least `63`.

Lower boxes:

- `Трійка`, `Каре`, `Фул-хаус`, `Малий стріт`, `Великий стріт`, `Покер`, `Шанс`.
- Five of a kind is `Покер` and is not a simplified `Фул-хаус`.

### Settlement

- Stake is reserved at session start.
- Quick wins and high scorecard completion can pay back from escrow.
- Draw cap, cancel and expiry refund reserved stake.
- Terminal callbacks must be replay-safe and clear the active stake key once.
- This slice does not create house money, tournaments or claimable tournament rewards.

### Dice Poker result rendering

Show:

- player dice and recognized hand;
- opponent dice and recognized hand in quick mode;
- scorecard turn/roll/current score summary in scorecard mode;
- why the result won/lost/drew;
- payout/refund/stake result;
- short colorful text, not formulas.

## Future extensions, not MVP

- rematch buttons;
- low-stake tavern tournaments;
- suspicious throw / cheating flavor without real exploit risk;
- spectator reactions without betting;
- NPC tutorial with no meaningful payout;
- titles or rumors after win streaks.
