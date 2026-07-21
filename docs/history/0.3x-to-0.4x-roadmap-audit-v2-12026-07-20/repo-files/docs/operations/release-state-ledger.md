# Release State Ledger

This ledger separates repository implementation from deployment and player
availability. Update it from target-environment evidence during every closeout.
Never infer hosted flag values from `.env.example`.

Allowed values: `yes`, `no`, `unknown`, `deferred`, `retired`, or a dated evidence
link/reference. A release is truthful when every row has an explicit decision;
not every feature must be enabled.

## Current 0.3.x baseline

| Surface | Code merged | Migration deployed | Flag in target | Automated checks | Manual Telegram QA | Kill switch / owner | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Party session foundation | yes (`0.2.15`) | unknown | unknown; default off | yes | unknown | `PARTY_SESSION_FOUNDATION_ENABLED`; owner TBD | verify or defer |
| Big Barrel Brother | yes (`0.2.17`) | unknown | unknown; default off | yes + simulator | refreshed full QA pending | `BIG_BARREL_BROTHER_RAID_ENABLED`; owner TBD | verify or defer |
| Tavern games / Tavlei / Dice Poker | yes (`0.2.21`, `0.2.27`) | unknown | unknown; defaults off | yes | unknown | table-game flags; owner TBD | verify or defer |
| HP recovery notifications | yes (PR `#159`) | unknown | unknown; default off | yes | copy/runtime QA pending | `HP_RECOVERY_NOTIFICATIONS_ENABLED`; owner TBD | verify or defer |
| Fighting Corner onboarding quest | yes (`0.3.10`) | unknown | unknown; default off | yes | rollout QA pending | `FIGHTING_CORNER_ONBOARDING_QUEST_ENABLED`; owner TBD | verify or defer |
| Varenyk-mancer Sated | yes (`0.3.12`) | unknown | part of runtime | yes | manual QA pending | deploy rollback owner TBD | verify |
| Bard Inspiration / Lament | yes (`0.3.14`) | unknown | follows existing surfaces | yes | manual QA pending | raid flag + deploy rollback owner TBD | verify |
| Big Barrel Raid Chat | release candidate (`0.3.15`) | not yet proven | default off | focused suite passes before blockers | pending | `BIG_BARREL_RAID_CHAT_ENABLED`; owner TBD | fix blockers, then decide |

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
