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

The current repository release is `0.4.0`:
[`0.4.0-party-vs-many-proof.md`](0.4.0-party-vs-many-proof.md). Its hidden,
rewardless proof remains default-off and hard-disabled in production;
deployment, production availability and manual Telegram QA are unproven.

[`0.4.1-group-combat-hardening.md`](0.4.1-group-combat-hardening.md) is the next
planned version. This repository-state reconciliation does not start it.

## Accepted 0.4.x planning

After `0.4.0`, use these accepted task contracts in order unless a later
product decision changes the sequence:

- [`0.4.1-group-combat-hardening.md`](0.4.1-group-combat-hardening.md)
- [`0.4.2-guild-foundation.md`](0.4.2-guild-foundation.md)
- [`0.4.3-party-expedition-mvp.md`](0.4.3-party-expedition-mvp.md)
- [`0.4.4-guild-weekly-goal.md`](0.4.4-guild-weekly-goal.md)
- [`0.4.5-old-altar-blessings-mvp.md`](0.4.5-old-altar-blessings-mvp.md)
- [`0.4.6-nearby-greeting-buff.md`](0.4.6-nearby-greeting-buff.md)
- [`0.4.7-shynok-food-buffs-mvp.md`](0.4.7-shynok-food-buffs-mvp.md)
- [`0.4.8-consumable-manatka-uses.md`](0.4.8-consumable-manatka-uses.md)
- [`0.4.9-shynok-takeaway-consumables.md`](0.4.9-shynok-takeaway-consumables.md)
- [`0.4.10-shynok-resale-listings.md`](0.4.10-shynok-resale-listings.md)
- [`0.4.11-korchmar-recycling.md`](0.4.11-korchmar-recycling.md)
- [`0.4.12-guild-cosmetic-progression.md`](0.4.12-guild-cosmetic-progression.md)

These are planned contracts, not merged or deployed features.

## Shipped records and historical drafts

- `0.4.0` is the current repository release record; `0.3.17` is the previous
  release record.
- Earlier numeric task files remain shipped records. This first-wave cleanup
  deliberately does not move all 107 shipped pre-`0.4` records.
- Superseded or consumed drafts live in [`archive/`](archive/).
- Unresolved ideas live in [`../backlog/`](../backlog/).
- Closed phases, audits and manual evidence live in
  [`../history/`](../history/).

Mass archival of shipped numeric task records is a separate mechanical PR after
`0.4.0`.

## Closeout

After a versioned task:

1. Run the release checklist when release-oriented.
2. Produce a compact handoff.
3. Close the thread.
4. Start the next versioned task in a fresh thread.
