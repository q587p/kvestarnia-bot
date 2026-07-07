# Architecture Docs

Use these docs when changing technical design, persistence, sessions, callbacks, idempotency, deployment boundaries or fair-play risk.

## Canonical technical references

- [`technical-plan.md`](technical-plan.md) — architecture, domains, data, callbacks, deployment and future technical decisions.
- [`security-and-fair-play.md`](security-and-fair-play.md) — anti-abuse, privacy, idempotency and fair play.
- [`../balance/notes.md`](../balance/notes.md) — balance formulas and economy guardrails that affect technical implementation.
- [`../operations/developer-setup.md`](../operations/developer-setup.md) — local setup and troubleshooting with Prisma/Render/scripts.

## Combat and session architecture

- [`bestiary-collection-data-model-notes.md`](bestiary-collection-data-model-notes.md) — data model notes for future bestiary collection work.
- [`combat-engine-design.md`](combat-engine-design.md) — combat engine design notes.
- [`effective-stats-and-equipment-effects-plan.md`](effective-stats-and-equipment-effects-plan.md) — effective stats and equipment-effect planning notes.
- [`GROUP_RAID_SESSION_MODEL.md`](GROUP_RAID_SESSION_MODEL.md) — proposed party/raid session model.
- [`group-raid-session-notes.md`](group-raid-session-notes.md) — earlier session row, participant and idempotency notes if kept as active technical input.
- [`../phase2/GROUP_COMBAT_AND_RAIDS.md`](../phase2/GROUP_COMBAT_AND_RAIDS.md) — how raids grow from duels, party sessions and multi-enemy combat.
- [`../phase2/ITEM_TAGS_AND_CONSUMABLES.md`](../phase2/ITEM_TAGS_AND_CONSUMABLES.md) — item tags, one-use manatky and combat actions from items.

## Change maps and audit packages

- [`../implementation/REPOSITORY_CHANGE_MAP.md`](../implementation/REPOSITORY_CHANGE_MAP.md) — future repository change map for the Big Barrel Brother package.
- [`../refactoring-audit/README.md`](../refactoring-audit/README.md) — imported refactoring audit package.
- [`../phase2-roadmap-audit/README.md`](../phase2-roadmap-audit/README.md) — imported roadmap audit package.

## Guardrails

- Telegram adapters stay out of pure domain logic.
- Runtime changes need focused tests or an explicit blocker.
- Docs-only architecture updates must not touch Prisma schema, migrations, generated files, lockfiles or runtime code unless explicitly requested.
