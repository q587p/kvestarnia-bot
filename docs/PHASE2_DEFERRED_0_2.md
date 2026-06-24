# Phase 2 Deferred Work For `0.2.x`

This document records work deliberately moved out of the `0.1.x` Phase 2 MVP closeout. It is a transition plan, not a promise to implement every item in parallel.

## Recommended `0.2.x` Order

### `0.2.0` - Safe Gifting MVP

Move exactly one eligible item stack unit from one player to another through sender preview, explicit recipient acceptance, audit history and exactly-once transaction semantics.

This is the smallest remaining social-interaction promise after duels, nearby targeting and Shynok sale reservations.

Prompt: [ai/prompts/safe-gifting-main-codex.md](ai/prompts/safe-gifting-main-codex.md).

Status: shipped in `0.2.0`.

### `0.2.1` - Multi-Enemy Foundation

Add backward-compatible state and exactly two enemies first. Do not include threat streaks, Yeger integration, location pools or a new reward faucet in the foundation PR.

Status: shipped in `0.2.1` as dev-only two-enemy exposure plus compatibility state. Production ordinary/Yeger/Adventure/training/duel starts remain one-enemy.

### `0.2.2` - Architecture Stabilization

Shipped a behavior-preserving architecture release that makes bot registration, cross-cutting middleware, runtime lifecycle and application composition easier to review before adding threat behavior.

Task: [tasks/0.2.2-architecture-stabilization.md](tasks/0.2.2-architecture-stabilization.md).

Status: shipped in `0.2.2` with no gameplay, schema, callback payload or stored-state changes.

Supporting docs:

- [architecture/0.2.x-release-sequence.md](architecture/0.2.x-release-sequence.md);
- [architecture/0.2.x-architecture-audit.md](architecture/0.2.x-architecture-audit.md);
- [architecture/0.2.x-target-architecture.md](architecture/0.2.x-target-architecture.md);
- [architecture/implementation-map.md](architecture/implementation-map.md).

### `0.2.3` - Threat Escalation

After the foundation:

- three one-enemy wins can make the next fight use two enemies;
- higher-tier progression and de-escalation are conservative;
- rewards scale carefully;
- authored gossip/escalation lines explain the shift.

If the architecture release shows `FightService` is still too dense for threat work, use [tasks/0.2.x-combat-application-decomposition.md](tasks/0.2.x-combat-application-decomposition.md) before Threat Escalation and shift behavior slices by one version.

### `0.2.4` - Item Tags / One-Use Manatky

Add a clear content contract for trade/use/duel/raid eligibility and one narrow consumable path. Do not ship a broad action catalog in the same slice.

## Later After Evidence

- paid postal/courier manatka delivery for known recipients who are not currently nearby;
- item-for-item trade;
- party skeleton, starting with [tasks/0.2.x-raid-party-session-foundation.md](tasks/0.2.x-raid-party-session-foundation.md) when explicitly activated;
- party vs one boss;
- real raids, with the Senior Barrel Brother planning package preserved in [SENIOR_BARREL_BROTHER_GROUP_RAID_PACKAGE.md](SENIOR_BARREL_BROTHER_GROUP_RAID_PACKAGE.md) and [tasks/0.2.x-senior-barrel-brother-group-raid.md](tasks/0.2.x-senior-barrel-brother-group-raid.md);
- tournament recognition;
- remort/social achievement-board ideas;
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

## Closeout Disposition

| Branch / task | Decision | Target |
|---|---|---|
| `origin/codex/0.1.24-shynok-drinks-mantok-sales` | shipped | `0.1.24` |
| `origin/codex/fight-buttons-one-row` | superseded by later combat UI | closed |
| `origin/codex/remort-memorial-inferred-levels` | absorbed into memorial-board release work | `0.1.24` |
| `origin/codex/remort-achievement-board` | deferred with achievements/social records | later `0.2.x`/alpha |
| `origin/codex/group-hook-design` | preserved as party/raid design input | after multi-enemy/social sessions |
| Senior Barrel Brother planning package | preserved as future docs-only party/raid design input | after party-session foundation |
| `docs/tasks/archive/queued-threat-streak-multi-enemy-fights.md` | split into multi-enemy foundation plus later threat escalation | `0.2.x` |
