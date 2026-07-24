# Left-Passage Party Attack Balance

Repository slice: `0.4.2`.

## Difficulty contract

- The reserved hard `deep-left` preview remains the primary enemy with its
  exact identity and effective level.
- One backup is added for two participants; two are added for three.
- Backups are selected deterministically through the authored solo Низ monster
  pool and canonical hard-passage difficulty primitives.
- The strongest bounded canonical solo pressure among the frozen roster applies
  only its repeated-pressure level bonus to the first backup, capped at 23.
- The strongest frozen remort count applies canonical multi-enemy remort
  adjustments to backups only. Neither pressure source must be the leader.
- Group outcomes do not write solo pressure history.

## Reward contract

One encounter-wide budget is derived from the frozen participant levels, not
from enemy count. XP and gold are divided equally among participants with at
least one committed manual action. Timeout auto-guards do not qualify. At most
one ordinary bandage roll is assigned once across the whole encounter.

This prevents 3×3 from multiplying loot three times and keeps the expected
per-player return bounded against comparable hard left-passage solo play and
Big Barrel participation. Rewards are not damage-weighted and the six
contribution dimensions are descriptive only.

## Verification

`npm run simulate:combat` completed the existing 24-case 2×2/3×3 matrix across
six support profiles and 13/25-turn scenarios with deterministic replay, legal
targets, committed-action accounting and authored cooldown reuse. Its maximum
serialized state remained `5,066/32,768` bytes.

The production repository fixture observed `38/42` start query events and, in
the final repeated gates, at most `3,504/32,768` state bytes and
`964/4,096` terminal-card bytes. The global
maximal terminal-card fixture remains `2,155/4,096`; the maximum callback
fixture remains `46/64`, while the v3 production start/invite shape is at most
`32/64`. The 2×2/3×3 reward-budget regression proves that adding another
backup does not multiply XP, gold or the single common roll.

All six existing support profiles completed the simulator matrix without a
required class/race composition gate; Telegram class/race evidence is still a
separate manual checkpoint.

Manual class/race evidence remains pending until the three-account Telegram
matrix is executed on the final exact head.
