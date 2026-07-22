# Architecture Docs

Use these docs when changing technical design, persistence, sessions, callbacks, idempotency, deployment boundaries or fair-play risk.

## Canonical technical references

- [`technical-plan.md`](technical-plan.md) — architecture, domains, data, callbacks, deployment and future technical decisions.
- [`security-and-fair-play.md`](security-and-fair-play.md) — anti-abuse, privacy, idempotency and fair play.
- [`../balance/notes.md`](../balance/notes.md) — balance formulas and economy guardrails that affect technical implementation.
- [`../operations/developer-setup.md`](../operations/developer-setup.md) — local setup and troubleshooting with Prisma/Render/scripts.

## Combat and session architecture

- [`party-combat-evolution-plan.md`](party-combat-evolution-plan.md) — canonical `0.4.x` boundary for separate generic 2–3×2–3 combat, lifecycle repair and per-participant settlement.
- [`bestiary-collection-data-model-notes.md`](bestiary-collection-data-model-notes.md) — data model notes for future bestiary collection work.
- [`combat-engine-design.md`](combat-engine-design.md) — combat engine design notes.
- [`effective-stats-and-equipment-effects-plan.md`](effective-stats-and-equipment-effects-plan.md) — effective stats and equipment-effect planning notes.
- [`../history/early-raid/`](../history/early-raid/) — earlier proposed Big Barrel/group-raid models and idempotency notes.
- [`../history/phases/phase2/planning/group-combat-and-raids.md`](../history/phases/phase2/planning/group-combat-and-raids.md) — closed Phase 2 raid-growth planning.
- [`../history/phases/phase2/planning/item-tags-and-consumables.md`](../history/phases/phase2/planning/item-tags-and-consumables.md) — closed Phase 2 item-tag planning.

## Change maps and audit packages

- [`../history/audits/refactoring-12026-06-27/`](../history/audits/refactoring-12026-06-27/) — closed refactoring audit.
- [`../history/audits/phase2-roadmap/`](../history/audits/phase2-roadmap/) — closed Phase 2 roadmap audit.

## Guardrails

- Telegram adapters stay out of pure domain logic.
- Runtime changes need focused tests or an explicit blocker.
- Docs-only architecture updates must not touch Prisma schema, migrations, generated files, lockfiles or runtime code unless explicitly requested.
