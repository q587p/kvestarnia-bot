# Release State Ledger

This ledger separates repository implementation from deployment and player
availability. Update it from target-environment evidence during every closeout.
Never infer hosted flag values from `.env.example`.

Allowed values: `yes`, `no`, `unknown`, `deferred`, `retired`, or a dated evidence
link/reference. A release is truthful when every row has an explicit decision;
not every feature must be enabled.

## Current repository baseline (repository evidence, 12026-08-02)

The current branch prepares package `0.4.3`. Merge, deployment and target
availability remain separate evidence.

| Surface | Code merged | Migration deployed | Flag in target | Automated checks | Manual Telegram QA | Kill switch / owner | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Party session foundation | yes (`0.2.15`) | unknown | unknown; default off | yes | not recorded | `PARTY_SESSION_FOUNDATION_ENABLED`; release operator unassigned | deferred |
| Big Barrel Brother | yes (`0.2.17`) | unknown | unknown; default off | yes + simulator | refreshed full QA pending | `BIG_BARREL_BROTHER_RAID_ENABLED`; release operator unassigned | deferred |
| Tavern games / Tavlei / Dice Poker | yes (`0.2.21`, `0.2.27`) | unknown | unknown; defaults off | yes | not recorded | table-game flags; release operator unassigned | deferred |
| HP recovery notifications | yes (PR `#159`) | unknown | unknown; default off | yes | copy/runtime QA pending | `HP_RECOVERY_NOTIFICATIONS_ENABLED`; release operator unassigned | deferred |
| Fighting Corner onboarding quest | yes (`0.3.10`) | unknown | unknown; default off | yes | rollout QA pending | `FIGHTING_CORNER_ONBOARDING_QUEST_ENABLED`; release operator unassigned | deferred |
| Varenyk-mancer Sated | yes (`0.3.12`) | no migration required | no separate flag; target deploy unknown | yes | manual QA pending | deploy rollback; release operator unassigned | deferred |
| Bard Inspiration / Lament | yes (`0.3.14`) | no migration for Inspiration; target migration state unknown | Inspiration follows runtime; Lament follows Big Barrel | yes | manual QA pending | Big Barrel flag + deploy rollback; release operator unassigned | deferred |
| Big Barrel Raid Chat | yes (PR `#179`, `0.3.15`) | target migration unknown | follows Big Barrel; target value unknown/default off | yes | post-fix full QA pending | `BIG_BARREL_BROTHER_RAID_ENABLED`; release operator unassigned | deferred |
| 0.3.16 closeout safeguards/report/docs | yes (PR `#182`) | target deployment unknown; repository includes `20260721113000_party_boss_round_history` | no new production flag; Big Barrel target value unknown/default off | yes; merge checks passed | target matrix not recorded | existing Big Barrel flag + deploy rollback; release operator unassigned | deferred |
| 0.3.17 callback read-path collapse | yes (PR `#183`) | no new migration | no new production flag | yes; merge checks passed | post-deploy observation not recorded | deploy rollback; release operator unassigned | deferred |
| 0.4.0 party-vs-many proof | yes; repository `0.4.0` | unknown; repository includes `20260722090000_group_combat_proof` with durable card-delivery revisions | unavailable in production; default off and production-hard-disabled | yes; repository gates plus restart/convergence/privacy regressions | pending | `GROUP_COMBAT_PROOF_ENABLED`; release operator unassigned | deferred |
| 0.4.1 group-combat hardening | yes; repository `0.4.1` | unknown; repository includes additive `20260723194500_group_combat_hardening` | unavailable in production; default off and production-hard-disabled | yes; focused domain/repository/parser/delivery/race tests, bounded simulator matrix and repository gates | pending on final exact head | `GROUP_COMBAT_PROOF_ENABLED`; release operator unassigned | deferred |
| 0.4.2 left-passage party attack | yes; merged PR `#187` | target deployment unknown; repository includes additive migration `20260724233000_left_passage_party_attack` | no target evidence; repository default off | yes; merge checks passed | manual three-account Telegram QA not recorded on merged head | `LEFT_PASSAGE_PARTY_ATTACK_ENABLED`; release operator unassigned | deferred |
| 0.4.3 consumable manatka uses | no; implementation branch | no migration required | no target evidence; all 20 exact mappings have no catalog-specific rollout flag, while existing combat-surface entry flags retain their scope | yes; exact-head static + 4,406 unit + 712 integration tests; 879 focused response-effect/runtime/combat/FightService/Party Boss/GroupCombat/Solo repository tests across 13 files; docs and combat simulator pass | one-account ordinary/out-of-combat and lone-owner `c002`, three-account Party Boss/GroupCombat matrix, cooldown `1`, `c006` zero-delta/protection composition, actual evade miss/retry/restart, earlier-protection/rider-only delta, two-enemy one-response, all-party owner scope, left-passage nearby invitation and full `3/3` checks pending | deploy rollback; release operator unassigned | deferred |

The `0.4.2` candidate also hides the GroupCombat one-use button when no item is
currently legal and records a successfully attached reply-keyboard fingerprint
in the same CAS that adopts its canonical card, preventing scheduler countdown
copies after a later acknowledgement failure. Losing sent candidates receive
bounded deletion retry and otherwise become only a compact inert superseded
note. Active and terminal replacement compact the previous canonical message
before its best-effort delete, so delete refusal cannot leave a second full
battle card or terminal result; a failed terminal inline-control edit keeps the
acknowledged result and retries that same message without another send.
Explicit refresh also persists a participant
keyboard request before delivery; a busy/restarted claim stays in the bounded
queue until the private keyboard is acknowledged. This remains automated
repository evidence only until the final-head Telegram matrix is rerun.
Generic navigation combat-lock recovery now reads one authoritative
`activeCombatLease`, loads only that exact owner and reuses the same lease for
solo overview. Privacy-safe callback evidence separates actor-visible latency
from post-presentation work without increasing participant fan-out.
The production opening message no longer mutates the canonical participant
reference and is serialized immediately before its keyboard-bearing canonical
card under the same durable claim, closing both the orphan race and the
plain-intro-last keyboard loss. Healthy claimed `menu-delivered` exit rows stay
repair-canonical until their final CAS; the exact temporary navigation lease is
resumed instead of turning every quest/location press into mismatch spam. Unchanged active
redraws omit inline reply markup and preserve the existing persistent keyboard
without another participant send; changed controls and explicit refresh still
use one fresh keyboard-card. This remains automated evidence until final-head
three-account Telegram QA.

Replace `unknown` with evidence; do not replace it with an assumption.

## Closeout evidence

Record:

- exact git SHA and package version;
- migration list/checksum and backup timestamp;
- target environment name, deploy id and flag values without secrets;
- automated command/results and simulator seed/report;
- manual QA date, accounts/roles, runtime and unperformed cases;
- production observation window and privacy-safe counters;
- kill-switch operator and rollback steps;
- final decision: `enabled`, `deferred`, `retired` or `blocked`.

## Minimum manual matrix for 0.3.x closeout

Use 2–3 accounts and cover risk, not every historical happy-path sentence:

- Charkokovalnia upgrade/attunement and effective equipment snapshot;
- duel → tournament/journal/rematch and Fighting Corner quest if enabled;
- Big Barrel create/join/start/round/terminal with Warrior, Kharakternyk,
  Bureaucramancer, Bard and Sated interactions;
- raid chat compose/newest-13/leave/rejoin/remort/flag-off/restart/`429`/permanent
  failure and terminal retention;
- `/restart` and `/remort` while leader/nonleader is in multi-actor combat;
- timeout/manual-action races, stale callbacks and scheduler restart;
- backup/restore plus post-deploy performance window on the target baseline.

Unperformed cases are acceptable only when written down with a decision and
owner. “Implemented” alone is not a rollout result.

## Current evidence gaps and decisions

- Repository evidence does not expose production deploy id, applied migration
  checksums, flag values, backup timestamp or observation counters. All target
  availability claims therefore remain deferred.
- No backup/restore drill or post-0.3.17 Telegram matrix is recorded in this
  checkout. The release operator is unassigned; assigning that owner is required
  before any deferred surface is enabled.
- Closed-alpha product reporting is available through the read-only aggregate
  command documented in `developer-setup.md`. It is evidence tooling, not proof
  of a completed production observation window.
- In-bot free-text feedback is deferred. A player admin allowlist is retired for
  0.3.x; existing admin command ids are not a player cohort gate.
