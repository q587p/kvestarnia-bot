# Release State Ledger

This ledger separates repository implementation from deployment and player
availability. Update it from target-environment evidence during every closeout.
Never infer hosted flag values from `.env.example`.

Allowed values: `yes`, `no`, `unknown`, `deferred`, `retired`, or a dated evidence
link/reference. A release is truthful when every row has an explicit decision;
not every feature must be enabled.

## Current repository baseline (repository evidence, 12026-07-29)

The current branch prepares package `0.4.2`. Merge, deployment and target
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
| 0.4.2 left-passage party attack | no; draft PR `#187` | no; branch keeps additive migration identity `20260724233000_left_passage_party_attack` with party origin, passage reservation, durable v3 operator marker/reason and a dedicated per-participant GroupCombat UI-publication claim table; rollback requires flag-off, healthy drain, explicit quarantine disposition and pre-migration restore | no target evidence; repository default off | exact focused/full counts are recorded in the task, QA and PR; exact-preview presence/effective-resource entry, 1–3 participant / 1–6 enemy deterministic scaling, generation-aware canonical reply-keyboard/card convergence with frozen stale-label validation, durable flee/terminal/newer-combat navigation ordering, KO observation, ordinary persistent-fight one-use-menu routing through the fight handler, post-victory nearby/deep-link join refusal, no artificial production turn defeat, rolling journal/final responses, monotonic level settlement, per-enemy ordinary-PvE XP/gold and authored/Loot Expansion/bandage/Iskrokamin rolls, remarks/eight symmetric contributions, exact receipt settlement/retry/level notices, action/timeout/settlement/delivery quarantine barriers, deferred-achievement absence and v1/v2 compatibility covered | manual three-account Telegram QA pending on final exact head; local two-account recovery diagnosis is not a full pass | `LEFT_PASSAGE_PARTY_ATTACK_ENABLED`; release operator unassigned | deferred |

The `0.4.2` candidate also hides the GroupCombat one-use button when no item is
currently legal and records a successfully attached reply-keyboard fingerprint
in the same CAS that adopts its canonical card, preventing scheduler countdown
copies after a later acknowledgement failure. This remains automated repository
evidence only until the final-head Telegram matrix is rerun.

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
