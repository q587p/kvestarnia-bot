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

Every frozen enemy contributes its ordinary persistent-PvE XP budget and one
character-level gold-band roll to the encounter-wide totals. Those per-enemy
budgets are added before XP and gold are split neutrally among participants
with at least one accepted manual action. A manual action remains eligible when
an earlier roster actor or a start-of-turn effect ends the fight before that
action executes; skipped actions spend no mana, items or cooldowns. Timeout
auto-guards do not qualify.

A production defeat keeps the bounded one-fifth consolation and adds half of
the ordinary persistent-PvE XP budget, rounded up, for every enemy actually
defeated before the party falls. The combined XP-only total is split through
the same manual-participant rule. Defeat grants no gold or loot. New encounters
freeze `defeated-enemies-half-xp.v1`; older active or terminal rows without that
policy retain their original replay result.

Every enemy also gets one deterministic ordinary broad-loot roll and one
ordinary post-fight bandage slot. The broad-loot multiplier is
`clamp(1 + 0.05 × (effectiveEnemyLevel - recipientLevel), 0.75, 1.5)`;
stronger enemies improve their roll, while additional enemies add independent
opportunities. Enemy rolls are assigned round-robin from a deterministic
offset among eligible manual participants and use the recipient's frozen
class/race/LUCK profile. Authored monster loot and eligible Loot Expansion
manatky can drop; a positive bandage slot keeps the ordinary `4–6%`
LUCK-bounded chance to become `Іскрокамінь` instead. Cosmetic titles are
presentation-only: their text never enters candidate, chance, weight,
recipient or settlement calculations. At encounter start, `lootVersion: 1`
freezes the result for every canonical enemy/participant pair. Terminal
round-robin recipient selection reads that bounded evidence, rebuilds the
canonical plan from it and never calls the mutable current catalog or generic
loot algorithm.

Rewards are not damage-weighted. The eight contribution dimensions are
descriptive only: damage, healing, prevented damage, control, damage taken,
committed/actions, special actions and guarded turns.

## Monster-special contract

Production `group-combat.v3` freezes the complete canonical 132-ability monster
catalog in its code-owned immutable production-v1 resolver. GroupCombat does
not maintain a shorter feature-specific allowlist: every ability that can be
selected by a canonical monster profile keeps its authored target scope,
damage, healing, shield, buff, debuff, cooldown and once-per-fight evidence.
This includes self and ally support, all-monster protection, all-player
pressure and single-player attacks such as both `monster.ledger-charge` and
`monster.ledger-audit`.

The common ability recipe determines which deterministic GroupCombat damage,
support and control components apply. Unknown ids, malformed frozen
definitions and persisted state that does not match the frozen effect values
are rejected strictly instead of being replayed as a basic attack or under
different semantics.

Two player support profiles have an authored direct-damage component without
an enemy target scope: `skill.strict-blessing` and
`gear.asclepius-instruction`. GroupCombat preserves their lowest-HP ally heal
and all-ally protection, while direct damage deterministically selects the
first living enemy in frozen order. No other supported profile is allowed to
use this exception without an explicit classification.

An enemy that was alive at the start of the participant/enemy exchange retains
one ordinary final basic response if participant damage defeats it first. That
response cannot select a special, heal, shield or buff. A start-of-turn effect
that defeats the last enemy ends combat before the exchange, so no enemy
responds. Production loss requires all participants to be defeated; the
25-turn forced loss remains proof-only. Longer production fights keep a rolling
last-25-turn journal so serialized state stays bounded.

## Verification

`npm run simulate:combat` completed the existing 24-case 2×2/3×3 matrix across
six support profiles and 13/25-turn scenarios with deterministic replay, legal
targets, committed-action accounting and authored cooldown reuse. Its maximum
serialized proof state remained bounded. Production 1×1 through 3×6 coverage
separately verifies the immutable scaling formula, full canonical ability
catalog parity,
authored targets/effects, the two support-scope/direct-damage profiles,
cooldown/fumble replay, cosmetic-title invariance, frozen loot-v1
catalog/algorithm drift and strict restart validation.

The production state budget is `65,536` bytes so the rolling last-25-turn 3×6
journal can retain each recorded turn's HP/mana, cooldowns and active effects; the
measured maximum and current card/query observations are recorded in the QA
document and draft PR. Telegram cards remain capped at `4,096` bytes and
callbacks at `64`. Reward-budget and loot regressions prove that each
additional enemy adds its canonical XP/gold budget and deterministic loot
opportunities, that effective enemy level scales the broad-roll chance, and
that authored/Loot Expansion items plus `Іскрокамінь` remain replay-safe.

All six existing support profiles completed the simulator matrix without a
required class/race composition gate; Telegram class/race evidence is still a
separate manual checkpoint.

Manual class/race evidence remains pending until the three-account Telegram
matrix is executed on the final exact head.
