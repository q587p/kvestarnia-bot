# Left-Passage Party Attack Balance

Repository slice: `0.4.2`.

## Difficulty contract

- The reserved hard `deep-left` preview remains the primary enemy with its
  exact identity and effective level.
- The base count is one enemy per frozen participant.
- Each participant adds one more deterministic backup when their frozen
  remort count is positive, their canonical solo Низ pressure selects two
  enemies, or their level is at least three above the reserved primary's
  effective level. The final encounter is capped at six enemies.
- Backups are selected deterministically through the authored solo Низ monster
  pool and canonical hard-passage difficulty primitives.
- The strongest bounded canonical solo pressure among the frozen roster applies
  only its repeated-pressure level bonus to the first backup, capped at 23.
- The strongest frozen remort count applies canonical multi-enemy remort
  adjustments to backups only. Neither pressure source must be the leader.
- Group outcomes do not write solo pressure history.

## Reward contract

One encounter-wide budget is derived from the strongest frozen enemy level,
not multiplied by enemy count. XP and gold are divided equally among participants with at
least one committed manual action. Timeout auto-guards do not qualify. At most
one ordinary bandage roll is assigned once across the whole encounter.

This prevents 3×6 from multiplying loot six times and keeps the expected
per-player return bounded against comparable hard left-passage solo play and
Big Barrel participation. Rewards are not damage-weighted and the six
contribution dimensions are descriptive only.

## Verification

`npm run simulate:combat` completed the existing 24-case 2×2/3×3 matrix across
six support profiles and 13/25-turn scenarios with deterministic replay, legal
targets, committed-action accounting and authored cooldown reuse. Its maximum
serialized proof state remained bounded. Production 1×1 through 3×6 coverage
separately verifies the immutable scaling formula, ability loadouts and restart.

The production state budget is `65,536` bytes so a complete 25-turn 3×6
journal can retain every turn's HP/mana, cooldowns and active effects; the
measured maximum and current card/query observations are recorded in the QA
document and draft PR. Telegram cards remain capped at `4,096` bytes and
callbacks at `64`. Reward-budget regressions prove that additional backups do
not multiply XP, gold or the single common roll.

All six existing support profiles completed the simulator matrix without a
required class/race composition gate; Telegram class/race evidence is still a
separate manual checkpoint.

Manual class/race evidence remains pending until the three-account Telegram
matrix is executed on the final exact head.
