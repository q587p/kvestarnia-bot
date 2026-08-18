# Release State Ledger

This ledger separates repository implementation from deployment and player
availability. Update it from target-environment evidence during every closeout.
Never infer hosted flag values from `.env.example`.

Allowed values: `yes`, `no`, `unknown`, `deferred`, `retired`, or a dated evidence
link/reference. A release is truthful when every row has an explicit decision;
not every feature must be enabled.

## Current repository baseline (repository evidence, 12026-08-18)

The repository baseline is package `0.4.5`, merged through Guild Foundation PR
`#190` at `a3945b1f11d313f842aa108c5b1abb9f42b43b44`. The unnumbered
GroupCombat SQLite delivery hotfix is merged at
`2afe359a914a92385623590c506c49abb9653034`; deployment and exact-head QA remain
separate evidence. The active narrow follow-up restores the missing public
guild-activation Chronicle event. Guild Foundation migration deployment, target
availability and manual QA also remain separate evidence. The release includes
the same-presence `🪺 Гніздо ґільдій`, active-only public directory,
exclusive catalog/custom emoji crests and 13-text private invitation cards. The original
foundation migration remains unchanged; additive
`20260806120000_guild_custom_crests` has a paired rollback and target deployment
remains unproven.

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
| 0.4.3 consumable manatka uses | yes; merged PR `#188` | no migration required | no target evidence; all 20 exact mappings have no catalog-specific rollout flag, while existing combat-surface entry flags retain their scope | yes; merge checks passed | final-head Telegram matrix not recorded | deploy rollback; release operator unassigned | deferred |
| Local isolated-runtime supervision/log retention | yes; merged PR `#189` | no production migration | local tooling only | yes; merge checks passed | local crash/restart observation not recorded here | managed runtime stop/refresh; owner unassigned | deferred |
| 0.4.4 bugfix & polish | yes; merged PR `#191` at `67bd02cd` | no migration required | production feedback proves the GroupCombat/left-passage path was reachable; exact hosted values remain unrecorded | yes; merge checks passed | formal final-head matrix not recorded; production feedback exposed stale cards under SQLite contention | deploy rollback; release operator unassigned | hotfix required |
| GroupCombat SQLite delivery hotfix | yes; merged PR `#192` at `2afe359a` | no migration required | no new flag | merge checks passed with actor-first/session-serialized-tail, exact-revision CAS, scheduler-overlap, restart recovery, completed-result deep-link replay, partial-`P1008`, retry-window and repository integration coverage | full three-account rerun not recorded on merged head | deploy rollback; release operator unassigned | deferred |
| 0.4.5 guild foundation, Guild Nest and emoji crests | yes; merged PR `#190` at `a3945b1f` plus Chronicle hotfix pending | target deployment unknown; repository includes unchanged additive `20260802230000_guild_foundation` plus additive `20260806120000_guild_custom_crests`, each with tested rollback/restore isolation; the initial-8/absolute-13 capacity boundary adds no schema field or migration | no target evidence; repository default off | PR #190 checks passed; activation Chronicle focused/full hotfix evidence belongs to its follow-up PR | exact-head three-account Nest/directory/create/invite/roles/remort/restart/party/privacy plus catalog/custom-emoji and invitation-card matrix pending, including level-6 rejection, level-7 first-life access and level-3 remort access | `GUILD_FOUNDATION_ENABLED`; release operator unassigned | deferred |

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
