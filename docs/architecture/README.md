# Architecture Docs

Use these docs when changing technical design, persistence, sessions, idempotency, deployment boundaries or fair-play risk.

## Canonical technical references

- [`../TECHNICAL_PLAN.md`](../TECHNICAL_PLAN.md) — architecture, domains, data, callbacks, deployment and future technical decisions.
- [`../SECURITY_AND_FAIR_PLAY.md`](../SECURITY_AND_FAIR_PLAY.md) — anti-abuse, privacy, idempotency and fair play.
- [`../BALANCE_NOTES.md`](../BALANCE_NOTES.md) — balance formulas and economy guardrails that affect technical implementation.
- [`../DEVELOPER_SETUP.md`](../DEVELOPER_SETUP.md) — local setup and troubleshooting with Prisma/Render/scripts.

## Sessions and group/raid architecture

- [`GROUP_RAID_SESSION_MODEL.md`](GROUP_RAID_SESSION_MODEL.md) — proposed party/raid session model.
- [`../GROUP_RAID_SESSION_NOTES.md`](../GROUP_RAID_SESSION_NOTES.md) — earlier session row, participant and idempotency notes.
- [`../phase2/GROUP_COMBAT_AND_RAIDS.md`](../phase2/GROUP_COMBAT_AND_RAIDS.md) — how raids grow from duels, party sessions and multi-enemy combat.
- [`../phase2/ITEM_TAGS_AND_CONSUMABLES.md`](../phase2/ITEM_TAGS_AND_CONSUMABLES.md) — item tags, one-use manatky and combat actions from items.

## Change maps and future package notes

- [`../implementation/REPOSITORY_CHANGE_MAP.md`](../implementation/REPOSITORY_CHANGE_MAP.md) — future repository change map for the Big Barrel Brother package.
- [`../refactoring-audit/README.md`](../refactoring-audit/README.md) — imported refactoring audit package.
- [`../phase2-roadmap-audit/README.md`](../phase2-roadmap-audit/README.md) — imported roadmap audit package.

## Guardrails

- Telegram adapters stay out of pure domain logic.
- Runtime changes need focused tests or an explicit blocker.
- Docs-only architecture updates must not touch Prisma schema, migrations, generated files, lockfiles or runtime code unless explicitly requested.
