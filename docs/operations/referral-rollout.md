# Operations — 0.4.6 Referral Foundation rollout

Status: proposed release runbook derived from `../../CONTRACT.md`.

## Baseline and flags

0.4.5 Guild Foundation and PR #193 / Guild Activation Chronicles are merged into `main` at `4eeddf162a9b3858b4b9fb617b58cd0a99b5bd69`. Implementation must branch from a fresh current `main`; deployment still verifies the target environment's migrations, exact build SHA and guild smoke tests rather than assuming production rollout state.

```env
REFERRAL_FOUNDATION_ENABLED=false
REFERRAL_REWARD_PAYOUTS_ENABLED=false
```

Both flags default false and fail closed.

| Foundation | Payouts | Expected behavior |
|---|---|---|
| off | off | No new links/captures/acceptances. Accepted referrals still record milestone entitlements as `PENDING`. |
| on | off | Acquisition works. Every earned reward bundle is persisted as `PENDING`; no gold or inventory is granted and no payout notification is sent. |
| off | on | Acquisition is paused. Existing accepted referrals continue to earn and automatically receive rewards. |
| on | on | Full acquisition, automatic payout and notifications. |

Neither flag deletes, rebinds, changes the frozen payload of or reissues an existing row.

## Pre-deploy gate

- [ ] The exact reward mapping is present once in canonical policy as one atomic `ReferralReward` bundle per stage:
  - level 3 achievement → `50` gold, `1 × item.dense-bandage`, `5 × item.iskrokamin`;
  - level 5 achievement → `120` gold, `1 × item.field-kit`, `13 × item.iskrokamin`;
  - level 8 achievement → `760` gold, `2 × item.field-kit`, `65 × item.iskrokamin`;
  - level 13 achievement → `900` gold, `3 × item.field-kit`, `193 × item.iskrokamin`.
- [ ] Before the link is shared, the private inviter dashboard discloses all four exact bundles with canonical Ukrainian item names, no technical IDs and no separate aggregate totals line; policy evidence remains `1/6/276/1830`, while invitee consent, lore and `news.md` stay spoiler-light.
- [ ] The dashboard opens a 13-variant invitation-copy generator; every text is reachable, the share URL encodes it correctly and regeneration never rotates the stable referral token.
- [ ] There are no click, signup, elapsed-time, daily-action, purchase or volume gates.
- [ ] The additive migration succeeds on an empty database and a production-like 0.4.5 database; backup restore is tested.
- [ ] Focused referral tests, full `npm run check`, `npm run db:validate`, migration/rollback smoke and `git diff --check` pass at the release SHA.
- [ ] The pre-presence capture transaction creates the fresh canonical User and `PENDING` attribution atomically; all pre-existing guild, party, duel, tavern-game, `support_thanks` and `nyz_left_attack_*` payload tests pass.
- [ ] Each row freezes exact `rewardGold` and strict `rewardItemsJson`; automatic gold plus all-item payout, `PENDING → GRANTED`, `actualGrantJson` and the uniquely keyed payout-notification outbox insert use one exact-once transaction with no partial grants or manual claim endpoint.
- [ ] A cold-start/scheduled outbox worker CAS-leases due or expired join/payout rows before Telegram I/O; healthy concurrent workers do not routinely double-send.
- [ ] Six-account Telegram QA passes in an isolated environment. Production debug/time/level helpers remain fail closed.
- [ ] The deployment owner can flip both global flags and verify bounded cold-start/interaction recovery of pending entitlements through the canonical payout service.
- [ ] V1 links are stable public identifiers with no per-code rotation/disable surface; the global foundation flag is the acquisition circuit breaker.
- [ ] Public copy does not promise availability before production smoke passes.
- [ ] Accepted first Character arrival durably freezes original Character ID/name/time and emits one sanitized normal-severity `referral.arrived` row instead of generic `character.created`, sharing its dedupe key; it appears in `all`/`adv`, not `imp`/`itm`. Injected ActivityEvent failure after arrival commit is recovered by a later scheduler/service instance exactly once. Progress/payout emits no additional referral-specific row, ordinary level rows remain, and merged `guild.created` still appears once under both intended filters after authoritative activation.

## Phase 0 — dark deployment

1. Record build SHA, migration, database backup and current flag values.
2. Apply the additive migration and deploy with both flags false.
3. Verify startup, ordinary `/start`, onboarding, Board navigation and existing 0.4.5 guild/social/start-payload routes.
4. Confirm referral UI and link creation are hidden, guessed referral payloads do not create attribution, and no unrelated gold or inventory changes occur.
5. Confirm an existing accepted fixture can record a milestone as `PENDING` while both flags are false; no grant or payout notification occurs.
6. Confirm the accepted arrival created one safe `all`/`adv` Chronicle row, no payout detail, no `imp`/`itm` row, and the existing guild-activation Chronicle regression remains green.

## Phase 1 — acquisition on, payouts paused

1. Set `REFERRAL_FOUNDATION_ENABLED=true` and keep payouts false.
2. With approved production smoke accounts, create a link, share it, complete fresh-user first-touch acceptance and create the invitee Character.
3. Verify one inviter join notification, one immutable attribution and dashboard visibility.
4. Reach the level-3 achievement through ordinary gameplay. Verify one frozen pending entitlement for `50` gold, one dense bandage and five Iskrokamin stones, zero economy delta and no payout notification.
5. Exercise invalid, self, existing-user and second-link/rebind attempts. Verify ordinary onboarding remains available.
6. Inspect logs and metrics for identity/token leakage and unexpected conflicts.

There is no natural 24-hour or multi-day safety window in this design. Keep payouts paused until these checks are complete.

## Phase 2 — automatic payouts on

1. Set `REFERRAL_REWARD_PAYOUTS_ENABLED=true`.
2. Verify the pending level-3 entitlement automatically grants exactly `50` gold, one dense bandage and five Iskrokamin stones to the inviter's current Character and changes once to `GRANTED`.
3. Verify policy validation checks the full plan/milestone/achievement/`rewardGold`/`rewardItemsJson` tuple before CAS, then the logical payout-outbox row commits atomically with the winner CAS and every gold/item mutation. Telegram delivery starts only after that commit.
4. Race two notification workers on join and payout outbox rows; one valid lease/token sends each event. Recover a seeded expired lease on cold start.
5. Replay the milestone and internal payout reconciler; gold, inventory and notification-row counts must remain unchanged.
6. Create a no-current-Character/restart-race fixture. Confirm the entitlement waits, then automatically grants its complete bundle once to the replacement current Character.
7. Race payout against remort of the same Character. Confirm gold and every item land wholly before or wholly after the life reset, never split across it and never regrant.
8. Smoke one level jump that crosses multiple milestones; each crossed reward is issued once with its complete frozen gold-and-items bundle. A full four-stage ladder totals exactly `1,830` gold, one dense bandage, six field kits and `276` Iskrokamin stones.
9. Race two distinct level-3 entitlements into the same existing and then absent item stacks. Confirm final gold is prior `+100`, dense bandages prior `+2`, Iskrokamin prior `+10`, and both unique outboxes exist.
10. Inject failure after CAS, after gold, after each item upsert and during outbox insertion. Every case rolls back the complete stage bundle and leaves the entitlement `PENDING`.
11. Seed malformed and policy-mismatched bundle rows. Confirm strict validation grants no component, reschedules with a bounded failure code and lets later valid rows progress.
12. Seed a pending row with payouts on and a current Character, cold-start the process and verify bounded startup recovery grants it once without player interaction; race startup recovery with an interaction retry.
13. Keep the acquisition flag available independently: a temporary foundation-off/payouts-on check must stop new capture without blocking accepted-referral payouts.

## Phase 3 — observation

For at least one normal release observation window, monitor:

- capture → accept → Character-arrived conversion;
- milestones earned and payout outcomes by the four bounded milestone keys;
- current and oldest `PENDING` entitlement age;
- unique/CAS conflicts and retry exhaustion;
- join and payout notification outcomes;
- referral-path impact on `/start`, onboarding and level-up error rates;
- gold and item units issued versus each immutable stage bundle; one completed ladder reconciles to `1,830` gold, one dense bandage, six field kits and `276` Iskrokamin stones.

High referral volume, fast progression and continued play on alternate accounts are expected product behavior, not automatic fraud signals.

## Metrics and invariants

Recommended low-cardinality metrics:

- `referral_capture_total{outcome}`;
- `referral_accept_total{outcome}`;
- `referral_milestone_total{milestone,outcome}`;
- `referral_payout_total{milestone,outcome}`;
- `referral_payout_gold_issued_total{milestone}`;
- `referral_payout_item_units_total{milestone,item}`;
- `referral_payout_pending` and pending-age histogram;
- `referral_notification_total{kind,outcome}`;
- `referral_conflict_total{operation}`.

Emission counters advance only from committed `GRANTED`/`actualGrantJson` evidence, never from pending attempts or mutable current balances after use, transfer, restart or remort.

Allow only bounded values. `milestone` is 3/5/8/13; `item` is `item.dense-bandage`, `item.field-kit` or `item.iskrokamin`; `kind` is join/payout. Do not use token, Telegram/user/chat identity, Character name, guild, share destination, free-form reason or UUID in aggregate labels.

Hard invariant alerts:

- more than one entitlement for one attribution/milestone/reward family;
- a `GRANTED` entitlement whose exact gold and every item delta did not commit in the same transaction;
- wrong, malformed, missing, extra or duplicate bundle component for a milestone;
- any partial stage grant, including gold without all items or only a subset of item grants;
- payout for a non-accepted, indirect or self attribution;
- regrant after invitee or inviter restart/remort, plan-version change or event replay;
- payout notification before `GRANTED`;
- existing User captured as a new invitee;
- referral handler swallowing a 0.4.5 start payload;
- a missing/duplicate/misfiltered `referral.arrived` row, leaked identity/token/reward detail, any extra milestone/payout referral row, or regression in existing `guild.created`;
- raw token or prohibited identity data in logs/metrics.

## Incident response

### Suspected duplicate or wrong payout

1. Set `REFERRAL_REWARD_PAYOUTS_ENABLED=false`; leave unrelated gameplay running.
2. Preserve entitlement, economy-transaction and outbox evidence by internal IDs.
3. Compare frozen `rewardGold`/`rewardItemsJson`, the CAS transition, `actualGrantJson`, exact Character gold delta and every `CharacterItem` delta.
4. Fix idempotency or mapping and deploy dark.
5. Reconcile only through the canonical service. Do not insert gold/items directly or automatically confiscate already granted rewards without a separate owner decision.

### Acquisition spam

1. Set `REFERRAL_FOUNDATION_ENABLED=false` if acquisition must stop globally; v1 has no per-code moderation surface.
2. Do not delete accepted relations or pending rewards.
3. Do not treat volume or deliberate alt leveling alone as fraud.
4. Re-enable acquisition after the cause is understood; existing accepted progression and payouts remain independent.

### Pending rewards are stuck

1. Keep acquisition running unless it contributes to load; turn payouts off only if grants are unsafe.
2. Verify current-Character resolution, strict bundle validation, gold increment, every item upsert, CAS conflict retry and the automatic retry trigger.
3. Fix the blocked canonical path, then restart/wake the bounded internal worker on a dark or isolated target before re-enabling normal delivery.
4. Confirm one payout notification appears only for rows that became `GRANTED`.

### Privacy or routing regression

1. Turn foundation off; turn payouts off as well if notification rendering or outbox data is affected.
2. Stop the affected worker/export, preserve minimal access-controlled evidence and patch the renderer/router.
3. Add a regression test for name-only rendering or the affected 0.4.5 payload.
4. Do not copy leaked identity/token data into ordinary incident notes.

## Rollback

The primary rollback is flags, not destructive schema reversal:

1. Set payouts false to stop gold-and-item grants.
2. Set foundation false if new acquisition must also stop.
3. Verify ordinary `/start`, onboarding, level-up and 0.4.5 guild/social routes.
4. Roll back application code only if the additive schema is compatible with the previous build.
5. Keep attribution, milestone, entitlement and notification rows for audit and exact-once recovery.
6. After the fix, deploy with both flags false, inspect pending aggregates on an isolated/dark target, then repeat the staged rollout.

## Recovery and data lifecycle

V1 deliberately adds no unauthenticated production admin command, per-code moderation endpoint or manual gold/inventory repair path. Recovery uses the two audited deployment flags, bounded automatic worker, ordinary safe-interaction wake-up and normal restricted database observability. The non-production `/dev_referral_reconcile` helper must stay production-hard-disabled and calls the same canonical payout service.

Attribution, milestone and payout uniqueness rows are User-level and survive Character restart/remort. The granted Character reference is nullable and `SetNull`. The 0.4.5 repository has no production User/account-deletion workflow, so referral User/attribution foreign keys use `onDelete: Restrict`; 0.4.6 does not invent a partial tombstone/scrub flow. A future account-deletion feature must define retention, anti-replay and name-scrubbing policy explicitly before it can remove a User. Never silently cascade exact-once history.
