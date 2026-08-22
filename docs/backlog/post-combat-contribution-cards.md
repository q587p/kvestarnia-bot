# Post-Combat Contribution Cards

Status: GroupCombat first shipped in `0.4.2`; the audited cross-mode expansion
is implemented in draft release PR `#196` for `0.4.7`. Merge, deployment,
production availability and Manual Telegram QA remain separate and unclaimed.

## Goal

Keep one readable eight-dimension `📊 Статистика` card pattern across every
shipped combat surface where the mode stores enough truthful evidence.

## Scope

- The `0.4.2` left-passage party attack keeps statistics behind a separate
  button beside its journal.
- Big Barrel and raid results receive an equivalent private participant
  statistics card using canonical stored contribution fields.
- The audited expansion covers ordinary one- and multi-enemy PvE, Training
  Doppelgänger, turn-based duels and every other shipped combat/result replay.
- Each combat mode maps only persisted facts it can prove. Missing dimensions
  are omitted or labelled as unavailable; they are never inferred from authored
  ability values or reconstructed from incomplete prose.
- Terminal, stale-card and journal replay show the same immutable statistics.
- Reuse the eight-dimension Ukrainian legend: damage dealt, healing, prevented
  damage, weakened response/control, damage taken, committed actions, special
  attacks and defensive turns.
- Keep the statistics button beside `📜 Журнал`; do not put the full table back
  into the main active or terminal combat card.

## Non-goals

- No reward, eligibility, achievement, ranking or public shaming based on the
  statistics.
- No cross-mode lifetime analytics or leaderboards.
- No FightService rewrite or forced shared persistence schema before each
  existing combat surface is audited.
- No exposure of hidden odds, threat formulas or private opponent choices.
- Future work may add explicitly designed lifetime analytics or new combat
  modes, but neither is implied by the `0.4.7` terminal-card implementation.

## Acceptance criteria

1. The left-passage party attack shows all eight explained GroupCombat
   dimensions from its immutable state/settlement evidence.
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

The owning task, compact context, changelog, player news and PR body carry the
`0.4.7` implementation evidence. Keep Manual Telegram QA, merge, deployment and
production availability explicit rather than treating this former backlog as
rollout proof.
