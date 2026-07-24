# Post-Combat Contribution Cards

Status: GroupCombat slice first shipped in repository release `0.4.2`; the
cross-mode expansion remains future work.

## Goal

Keep the readable six-icon GroupCombat contribution summary as a result-card
pattern: show it after party expeditions and raids first, then extend it to
other completed fights wherever the mode stores enough truthful evidence.

## Scope

- The `0.4.2` left-passage party attack renders a compact explained
  contribution block for every participant.
- Big Barrel result cards receive an equivalent private participant summary
  using the raid's canonical stored contribution fields.
- A later audited pass may cover ordinary one/multi-enemy PvE, Training
  Doppelgänger and turn-based duels.
- Each combat mode maps only persisted facts it can prove. Missing dimensions
  are omitted or labelled as unavailable; they are never inferred from authored
  ability values or reconstructed from incomplete prose.
- Terminal, stale-card and journal replay show the same immutable statistics.
- Keep Ukrainian labels beside the icons so players do not need an external
  legend: damage dealt, healing, prevented damage, weakened response/control,
  damage taken and committed actions when supported by that mode.

## Non-goals

- No reward, eligibility, achievement, ranking or public shaming based on the
  statistics.
- No cross-mode lifetime analytics or leaderboards.
- No FightService rewrite or forced shared persistence schema before each
  existing combat surface is audited.
- No exposure of hidden odds, threat formulas or private opponent choices.

## Acceptance criteria

1. The left-passage party attack shows the six explained GroupCombat
   dimensions from its immutable terminal state/settlement plan.
2. Big Barrel shows a truthful equivalent from canonical raid contribution
   state without changing raid reward eligibility or settlement.
3. Every added combat surface has an explicit field mapping and exact-effect
   tests; unsupported dimensions are not fabricated as zero.
4. Duplicate callbacks, restart and stale result cards replay identical values
   without new combat, reward or analytics writes.
5. Participant details remain private where the combat mode is private; shared
   cards use only the already-approved aggregate disclosure.
6. The result card remains within the Telegram `4,096`-byte budget with maximal
   names, journal controls, rewards and statistics.
7. Ordinary PvE, multi-enemy PvE, Training Doppelgänger, turn duel, GroupCombat
   and Big Barrel regressions pass for every shared presenter primitive changed.

## Relevant files / search terms

- GroupCombat `contributions`, terminal settlement plans and presenter legend.
- PartyBoss contribution and terminal result presenters.
- solo combat, Training Doppelgänger and turn-duel terminal state/journals.
- stale callbacks, result replay, Telegram card byte budgets and privacy.

## Focused tests

- Exact field-to-icon mappings and maximal terminal card sizes.
- Restart, duplicate callback and stale-card replay.
- Private/shared disclosure boundaries.
- Cross-surface parity only for modes touched by the implementation task.

## Manual Telegram QA

Finish and replay representative wins/losses with damage, healing, guard and
control roles. Confirm the numbers and labels match the journal, remain stable
after restart and do not reveal another player's private detail on public cards.

## Release surfaces

When activated, update the owning version task, QA matrix, combat architecture,
playtesting notes, compact context, changelog, player news when visible, and the
PR body. Do not present this backlog contract as shipped behavior.
