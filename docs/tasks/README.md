# Version Task Docs

Every versioned gameplay/runtime PR gets one short English task doc:

```text
docs/tasks/<version>-<short-slug>.md
```

Task docs keep implementation prompts short and preserve decisions between
threads. Use
[`main-new-version-thread.md`](../ai/prompts/main-new-version-thread.md) for
implementation and
[`second-codex-pr-review.md`](../ai/prompts/second-codex-pr-review.md) for a
read-only review.

## Required sections

- Goal
- Scope
- Non-goals
- Acceptance criteria
- Relevant files / search terms
- Focused tests
- Manual Telegram QA
- Release surfaces

Keep each task compact and link to canonical docs instead of copying them.

## Current release and next task

The current implementation release is `0.4.5` on PR #190:
[`0.4.5-guild-foundation.md`](0.4.5-guild-foundation.md).
Its corrected default-off durable guild social shell is under final automated
verification. Manual three-account Telegram QA, merge, migration deployment,
target enablement and production availability remain unproven. An audited
abandoned-leader operator runbook is a production-enable blocker.

[`0.4.6-guild-weekly-goal.md`](0.4.6-guild-weekly-goal.md) is the next planned version.

## Accepted 0.4.x planning

After `0.4.5`, use these accepted task contracts in order unless a later
product decision changes the sequence:

- [`0.4.6-guild-weekly-goal.md`](0.4.6-guild-weekly-goal.md)
- [`0.4.7-old-altar-blessings-mvp.md`](0.4.7-old-altar-blessings-mvp.md)
- [`0.4.8-nearby-greeting-buff.md`](0.4.8-nearby-greeting-buff.md)
- [`0.4.9-shynok-food-buffs-mvp.md`](0.4.9-shynok-food-buffs-mvp.md)
- [`0.4.10-shynok-takeaway-consumables.md`](0.4.10-shynok-takeaway-consumables.md)
- [`0.4.11-shynok-resale-listings.md`](0.4.11-shynok-resale-listings.md)
- [`0.4.12-korchmar-recycling.md`](0.4.12-korchmar-recycling.md)
- [`0.4.13-guild-cosmetic-progression.md`](0.4.13-guild-cosmetic-progression.md)

These are planned contracts, not merged or deployed features.

## Shipped records and historical drafts

- `0.4.4` is the latest merged repository release record; `0.4.5` is the active
  implementation target.
- Earlier numeric task files remain shipped records. This first-wave cleanup
  deliberately does not move all 107 shipped pre-`0.4` records.
- Superseded or consumed drafts live in [`archive/`](archive/).
- Unresolved ideas live in [`../backlog/`](../backlog/), including the
  [`dedicated combat reply keyboard`](../backlog/dedicated-combat-reply-keyboard.md)
  findings captured from 0.4.2 Telegram QA.
- Closed phases, audits and manual evidence live in
  [`../history/`](../history/).

Mass archival of shipped numeric task records is a separate mechanical PR after
`0.4.1`.

## Closeout

After a versioned task:

1. Run the release checklist when release-oriented.
2. Produce a compact handoff.
3. Close the thread.
4. Start the next versioned task in a fresh thread.
