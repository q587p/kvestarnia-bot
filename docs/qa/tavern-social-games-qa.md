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

## Unit tests: Kosti resolver

- Hand ranking order: five-kind > straight > four-kind > full house > triple > two pairs > pair > high.
- Sign detection covers:
  - exact two pairs;
  - triple or better;
  - high hand sum >= 22;
  - straight 1-5 or 2-6;
  - tower four/five same;
  - no sign default if implemented.
- Main/sign pool split conserves pot.
- No sign winners sends sign pool to main winner.
- Multiple sign winners split sign pool.
- Remainder goes to main winner.
- Style modifiers apply to score without mutating raw dice.
- Tie-break order is deterministic.

## Unit tests: economy and state

- Create fails if stake exceeds gold.
- Join fails if stake exceeds gold.
- Create subtracts creator stake exactly once.
- Join subtracts participant stake exactly once.
- Duplicate create/join/decision callbacks are idempotent or return current state.
- Resolve pays exactly once.
- Re-resolving a completed session does not mutate gold.
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
- Kosti accepts 2-7 players.
- Kosti can resolve after minimum players if a `resolve now` action exists.
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
4. Create Kosti with 3 users, mixed styles/signs, verify readable result and exact pot conservation.
5. Let Kosti expire with only 1 participant, verify refund.
6. Press stale buttons after completion and after expiration.
7. Try insufficient gold.
8. Try create/join/decision while under combat lock.
9. Run the repo's local checks, at minimum `npm run check` if available.
10. Inspect DB rows for terminal statuses and no orphan escrow.
