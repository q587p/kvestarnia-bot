# QA Docs

Use these docs for manual QA scripts, smoke matrices, release gates and feature-specific proof checklists.

## Canonical smoke entry points

- [`../operations/playtesting.md`](../operations/playtesting.md) — manual smoke test for the current playable loop.
- [`../history/evidence/manual-qa/phase2-regression-smoke.md`](../history/evidence/manual-qa/phase2-regression-smoke.md) — closed Phase 2 regression gate.

## Feature-specific QA packages

- [`mantok-ability-grants-foundation-qa.md`](mantok-ability-grants-foundation-qa.md) — Mantok Ability Grants QA checklist when present in the active branch.
- [`latest-events-feed-qa.md`](latest-events-feed-qa.md) — latest events feed QA package if present.
- [`duel-tournaments-qa.md`](duel-tournaments-qa.md) — turn-based duel tournament reward QA checklist and current manual status.
- [`../history/early-raid/big-barrel-brother-group-raid-qa.md`](../history/early-raid/big-barrel-brother-group-raid-qa.md) — historical Big Barrel group-raid QA matrix.
- [`varenyk-mancer-sated-support-qa.md`](varenyk-mancer-sated-support-qa.md) — compact manual Telegram checklist for `0.3.12` feeding, lazy sustain and durable combat pulses; results remain pending until actually run.
- [`0.3.14-bard-inspiration-and-raid-lament-qa.md`](0.3.14-bard-inspiration-and-raid-lament-qa.md) — focused automated and pending manual Telegram checklist for Inspiration and Big Barrel Lament.
- [`0.3.15-raid-chat-qa.md`](0.3.15-raid-chat-qa.md) — focused raid-chat concurrency, restart, replay, delivery and terminal-retention QA package.
- [`0.4.0-party-vs-many-proof-qa.md`](0.4.0-party-vs-many-proof-qa.md) — compact manual checklist for the default-off rewardless 2–3×2–3 group-combat proof; evidence remains pending until run with local accounts.
- [`0.4.1-group-combat-hardening-qa.md`](0.4.1-group-combat-hardening-qa.md) — target/ability, AI/status/death, item/gear, settlement/lifecycle and delivery matrix for the hardened proof; manual evidence remains pending on the final exact head.
- [`0.4.2-left-passage-party-attack-qa.md`](0.4.2-left-passage-party-attack-qa.md) — reservation, recruitment, authoritative roster, production settlement, flag and replay matrix for the default-off left-passage party attack; manual Telegram evidence remains pending.

## Historical smoke records

- [`../history/phase1/closeout-smoke.md`](../history/phase1/closeout-smoke.md) — Phase 1 final smoke gate.
- [`../history/phase1/qa-bug-template.md`](../history/phase1/qa-bug-template.md) — old Phase 1 QA bug template if present.
- [`../history/phase2/closeout-smoke.md`](../history/phase2/closeout-smoke.md) — Phase 2 MVP closeout smoke.
- [`../history/evidence/manual-qa/`](../history/evidence/manual-qa/) — release-specific smoke and manual QA evidence.

## Guardrails

- QA docs should list exact commands/manual flows, expected visible behavior and known blockers.
- Docs-only QA updates must not change runtime code.
- Manual Telegram evidence gaps belong in the active task or PR body, not as vague TODOs.
