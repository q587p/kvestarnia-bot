# Phase 2 Deferred Work For `0.2.x`

This document records work deliberately moved out of the `0.1.x` Phase 2 MVP closeout. It is a transition plan, not a promise to implement every item in parallel.

## Recommended `0.2.x` Order

### `0.2.0` - Safe Gifting MVP

Move exactly one eligible item stack unit from one player to another through sender preview, explicit recipient acceptance, audit history and exactly-once transaction semantics.

This is the smallest remaining social-interaction promise after duels, nearby targeting and Shynok sale reservations.

### `0.2.1` - Multi-Enemy Foundation

Add backward-compatible state and exactly two enemies first. Do not include threat streaks, Yeger integration, location pools or a new reward faucet in the foundation PR.

### `0.2.2` - Threat Escalation

After the foundation:

- three one-enemy wins can make the next fight use two enemies;
- higher-tier progression and de-escalation are conservative;
- rewards scale carefully;
- authored gossip/escalation lines explain the shift.

### `0.2.3` - Item Tags / One-Use Manatky

Add a clear content contract for trade/use/duel/raid eligibility and one narrow consumable path. Do not ship a broad action catalog in the same slice.

## Later After Evidence

- item-for-item trade;
- party skeleton;
- party vs one boss;
- real raids;
- tournament recognition;
- richer remort-only social records;
- achievements and collections;
- monster gender/case metadata;
- food, coffee and bard performance after economy telemetry.

## Hard Deferred

- market, auction or buyback;
- item-instance rewrite;
- guild wars;
- paid power;
- broad party-vs-many runtime;
- Mini App dependency.

## WIP Limit

Use one versioned feature branch at a time. A second Codex thread may review or QA, but should not run a competing implementation track.

## Archive Cleanup Rule

Closed unmerged PRs and old design branches should be classified during closeout as one of:

- superseded;
- absorbed/cherry-picked into a newer release;
- intentionally abandoned;
- preserved as future design input.

Do not put PR numbers in artifact filenames. PR numbers can appear inside closeout notes when they explain why something was archived or absorbed.
