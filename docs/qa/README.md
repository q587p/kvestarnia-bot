# QA Docs

Use these docs for manual QA scripts, smoke matrices, release gates and feature-specific proof checklists.

## Canonical smoke entry points

- [`../operations/playtesting.md`](../operations/playtesting.md) — manual smoke test for the current playable loop.
- [`../tasks/phase2-regression-smoke.md`](../tasks/phase2-regression-smoke.md) — read-only/manual Phase 2 regression gate.

## Feature-specific QA packages

- [`mantok-ability-grants-foundation-qa.md`](mantok-ability-grants-foundation-qa.md) — Mantok Ability Grants QA checklist when present in the active branch.
- [`latest-events-feed-qa.md`](latest-events-feed-qa.md) — latest events feed QA package if present.
- [`duel-tournaments-qa.md`](duel-tournaments-qa.md) — turn-based duel tournament reward QA checklist and current manual status.
- [`BIG_BARREL_BROTHER_GROUP_RAID_QA.md`](BIG_BARREL_BROTHER_GROUP_RAID_QA.md) — future Big Barrel Brother QA matrix if present.
- [`varenyk-mancer-sated-support-qa.md`](varenyk-mancer-sated-support-qa.md) — compact manual Telegram checklist for `0.3.12` feeding, lazy sustain and durable combat pulses; results remain pending until actually run.

## Historical smoke records

- [`../history/phase1/closeout-smoke.md`](../history/phase1/closeout-smoke.md) — Phase 1 final smoke gate.
- [`../history/phase1/qa-bug-template.md`](../history/phase1/qa-bug-template.md) — old Phase 1 QA bug template if present.
- [`../history/phase2/closeout-smoke.md`](../history/phase2/closeout-smoke.md) — Phase 2 MVP closeout smoke.

## Guardrails

- QA docs should list exact commands/manual flows, expected visible behavior and known blockers.
- Docs-only QA updates must not change runtime code.
- Manual Telegram evidence gaps belong in the active task or PR body, not as vague TODOs.
