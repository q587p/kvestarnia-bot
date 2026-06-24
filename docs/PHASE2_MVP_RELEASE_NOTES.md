# Phase 2 MVP Release Notes - 0.1.25

## Summary

`0.1.25` closes the `0.1.x` Phase 2 Social Combat MVP line for Квестарня. This is a release/docs/smoke milestone: it records what shipped through `0.1.24`, preserves Phase 1 as already closed in `0.1.0`, and moves the next expansion work into `0.2.x`.

No gameplay runtime, Prisma schema, migration, formula, balance, economy or new feature surface ships in this release.

## Shipped Phase 2 MVP

- Level 3+ Fighting Corner and training doppelganger.
- Opt-in instant duels with deep links, accept, decline, cancel, expire, replay and result sharing.
- Opt-in turn-based duels with private turns, surrender, timeout, rematch, share and active combat locks.
- Nearby same-location targeting without forced PvP or exact public tracking.
- Combat action foundation: attack, defend, class skills, flee, action availability and short turn deadlines.
- Monster ability and battle-journal layers for ordinary PvE fights.
- Nyz passage preview memory, survivor re-attack and ordinary anti-repeat selection.
- Terminal combat settlement, remort safety and memorial-board follow-ups.
- Shynok drinks, opt-in rounds and safe manatka sales as the narrow economy-prep slice.

## Closeout Status

- Phase 1 remains closed by `0.1.0`.
- Phase 2 Social Combat MVP is considered shipped after `0.1.24` plus the accepted two-account regression/manual QA.
- `0.1.x` is closed after this release unless an emergency hotfix is needed.
- `docs/ai/prompts/safe-gifting-main-codex.md` remains the next implementation prompt.
- The first `0.2.x` task is `docs/tasks/0.2.0-safe-gifting-mvp.md`.

## Deferred To `0.2.x`

- Safe gifting and later bilateral trading.
- Multi-enemy combat foundation and threat escalation.
- Item tags, one-use manatky and expanded equipment/item rebalance.
- Party skeleton, party combat and real raids.
- Tournament recognition, broader social records and richer collection layers.
- Food, coffee, bard performance, buyback, markets and general shop work.

## Smoke Evidence

The closeout references the completed post-`0.1.24` two-account regression audit/manual QA. The retained smoke checklist is `docs/PHASE2_CLOSEOUT_SMOKE.md`; the compact audit task is `docs/tasks/phase2-regression-smoke.md`.

Before merge, the release branch must still pass the automated gate from the task doc:

```bash
npm run db:validate
npm run lint
npm run typecheck
npm test
npm run check
git diff --check
```

## Known Limits

- No trading, gifting, multi-enemy, party, raid, tournament, food, coffee or achievements runtime is included here.
- No hidden blocker fix is bundled into this closeout.
- Shipped social rewards remain capped; this release does not add wagers, item loss, broad PvP, markets or paid power.

## Handoff

Start the next implementation in a fresh Codex thread with:

```text
Use $kvestarnia-version-task.

Implement:
docs/tasks/0.2.0-safe-gifting-mvp.md

Context:
docs/ai/context.md
```
