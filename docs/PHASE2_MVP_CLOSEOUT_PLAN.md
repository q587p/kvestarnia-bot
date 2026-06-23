# Phase 2 MVP Closeout Plan

Snapshot date: 12026-06-23.

This document defines the cutline for closing the `0.1.x` Phase 2 Social Combat MVP line. It is a planning and release-readiness source of truth, not a claim that the closeout release has already shipped.

## Formal Status

### Phase 1

Phase 1 is closed in `0.1.0`. It should not receive new feature work. The remaining obligation is regression smoke for the playable loop:

`/start -> first item -> persistent fight -> rewards -> inventory/equipment -> level progress`.

### Phase 2 MVP

Phase 2 MVP proves that two players can safely and voluntarily interact through Telegram-native combat/social flows, while stale callbacks, retries and restarts do not corrupt state or duplicate rewards.

The MVP can be considered closed after:

- `0.1.24` Shynok drinks, opt-in rounds and manatka sales are merged and deployed;
- a two-account social-combat regression smoke is recorded;
- migration, idempotency and combat-lease paths are checked;
- `0.1.25 - Phase 2 MVP Closeout` ships as a docs/release/smoke milestone;
- shipped and deferred Phase 2 scope is explicitly separated.

## Shipped MVP Surface

The closeout should treat this vertical slice as the shipped Phase 2 MVP surface:

- training doppelganger;
- opt-in instant duels;
- opt-in turn-based duels;
- accept, decline, cancel and expire transitions;
- rematch and shareable result cards;
- same-location targeted invites;
- combat leases and combat-lock routing;
- stale callback and replay-safe terminal state;
- defend, class skills, timeouts, monster abilities and battle journal;
- presence routing and encounter preview memory;
- base remort flow plus memorial-board follow-ups;
- Shynok self-drinks, opt-in rounds and safe manatka sales as the narrow economy-prep slice.

## Closeout Scope

- Finish and deploy the active Shynok slice.
- Preserve the remort memorial inferred-level fix in the active release.
- Run full CI plus focused high-risk tests.
- Run manual Telegram QA with at least two characters.
- Run production migration and deploy smoke.
- Run cross-system regression for solo combat, duels, remort, presence, stale callbacks and Shynok isolation.
- Update roadmap/status/docs/task archive.
- Prepare exactly one next `0.2.0` task.

## Not In Closeout

- Trading/gifting runtime.
- Multi-enemy runtime.
- Item tags and one-use manatky.
- Tournament or rating power.
- Party combat and real raids.
- Proactive durable HP-full notifications.
- Food, coffee, bard income or a general shop.
- Achievements and collections.
- Item-instance inventory, market or buyback.
- Broad class, monster or economy rebalance.

## Severity Gate

### Blocker

Do not merge or deploy while any of these are true:

- duplicate spend, reward or item movement;
- queued drink can power more than one fight after retry or crash;
- migration cannot apply cleanly;
- stale callback mutates current state;
- PvP, training or starter combat receives drink power;
- remort corrupts or leaks combat/economy state;
- active combat lease can be bypassed;
- production startup or health check fails.

### Important

Merge only after an explicit decision and recorded follow-up:

- misleading player copy around price or effect;
- round offer cannot be safely accepted or replayed;
- sale basket drift is not rejected;
- historic remort rows are inconsistent;
- presence target list is wrong or privacy-unsafe.

### Minor / Deferred

These do not block closeout:

- extra flavor;
- additional drink or food variants;
- proactive notifications;
- cosmetic board polish;
- broader balance tuning without a regression.

## Work Order

1. Accept the active Shynok release: keep scope frozen, run independent review, fix only blockers or important findings, refresh the PR body and verify exact-head CI.
2. Run manual Telegram QA, merge and deploy `0.1.24`.
3. Run the Phase 2 regression smoke and record a pass/fail matrix.
4. Implement `0.1.25 - Phase 2 MVP Closeout` as a release/docs/smoke task with no new gameplay.
5. Merge/tag/deploy the closeout, then start one fresh `0.2.0` thread.

If a blocker appears after deploy, create a narrow fix task. Do not hide it inside closeout docs. If the next patch version must be used by a runtime hotfix, move the closeout task to the next free patch.

## Backlog Disposition

| Item | Decision | Target | Reason |
|---|---|---:|---|
| Shynok drinks, rounds and manatka sales | Finish now | `0.1.24` | Active release with code, migration, docs and tests. |
| Remort memorial inferred levels | Absorb | `0.1.24` | Fix belongs with the active release, not a parallel track. |
| Active fight buttons on one row | Archive as superseded | closeout | Covered by newer combat presentation work. |
| Remort detail-board work | Archive as absorbed | closeout | Covered by newer memorial changes. |
| Phase 1 feature ideas | Do not reopen | - | Phase 1 is closed; only regressions or blockers remain. |
| Durable HP-full notifications | Defer | later `0.2.x`/alpha | Needs outbox/claim semantics. |
| Tournament/rating recognition | Defer | after duel telemetry | Result/rematch cards already prove the MVP. |
| Gift one manatka unit | First recommended `0.2.0` | after closeout | Smallest remaining social-interaction promise. |
| Bilateral item-for-item trade | Defer | later `0.2.x` | Needs proven reservations, audit and accept flow. |
| Gold add-on, market or buyback | Hard defer | economy phase | Higher abuse/economy risk. |
| Threat-streak multi-enemy task | Preserve and split | `0.2.1+` | Current scope is too large for one PR. |
| Item tags and one-use manatky | Defer | `0.2.x` | New content/runtime contract. |
| Party skeleton and real raids | Defer | after multi-enemy/social sessions | Old raid docs are later input, not the next step. |
| Food, coffee and bard performance | Backlog | after economy telemetry | Do not widen Shynok immediately after launch. |
| Achievements and collections | Backlog | closed alpha/content phase | Not a social-combat MVP blocker. |
| Monster gender/case metadata | Backlog | content-quality slice | Useful, but not correctness-critical. |
| Broad balance rewrite | Separate evidence-driven releases | later | Do not rebalance everything during closeout. |

## Definition Of Done

### Product

- Two players can complete an opt-in quick duel.
- Two players can complete a turn-based duel.
- Decline, cancel and expire do not punish the player.
- Rematch and share cards work without rerolling.
- Same-location invite does not show invalid or stale targets as available.
- Social rewards are capped and cannot create gold/item/manatka snowball.
- Shynok rounds are opt-in and do not force a recipient to accept a drink.

### Correctness

- Duplicate and stale callbacks replay or reject without mutating twice.
- Active combat lease cannot be bypassed through navigation, Shynok, remort or another start flow.
- Turn timeout has one durable winner in a callback race.
- Terminal rewards, XP and cooldowns are granted exactly once.
- Queued drink cannot apply to two fights after crash/retry.
- Sale cannot consume missing, equipped, protected or reserved items.
- Round price and recipients are frozen at the preview/confirm boundary.
- PvP, starter and training combat do not read PvE drink power.
- Remort behavior for drinks is explicitly defined and tested.

### Release

- Active migration applies on a production-like database.
- Exact-head CI is green.
- Full `npm run check` passes.
- Two-account manual smoke passes.
- Production `/health`, `/version` and `/news` pass.
- No blocker or important finding remains without an explicit owner/decision.

### Documentation

- Phase 1 remains marked closed.
- Phase 2 MVP shipped scope is listed.
- Remaining Phase 2 expansion is moved to `0.2.x`.
- Superseded PRs/tasks are archived, not reopened.
- `docs/ai/context.md` remains compact.
- The next task is one scoped `0.2.0` doc and one fresh Codex thread.
