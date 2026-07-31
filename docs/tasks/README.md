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

The current repository release is `0.4.2`:
[`0.4.2-left-passage-party-attack.md`](0.4.2-left-passage-party-attack.md).
Its production-capable left-passage entry remains default-off; manual Telegram
QA, production enablement, merge and deployment remain unproven.

[`0.4.3-consumable-manatka-uses.md`](0.4.3-consumable-manatka-uses.md) is the
next planned version. Its exact item/effect allowlist remains an activation gate,
not an implemented catalog.

## Accepted 0.4.x planning

After `0.4.2`, use these accepted task contracts in order unless a later
product decision changes the sequence:

- [`0.4.3-consumable-manatka-uses.md`](0.4.3-consumable-manatka-uses.md)
- [`0.4.4-guild-foundation.md`](0.4.4-guild-foundation.md)
- [`0.4.5-guild-weekly-goal.md`](0.4.5-guild-weekly-goal.md)
- [`0.4.6-old-altar-blessings-mvp.md`](0.4.6-old-altar-blessings-mvp.md)
- [`0.4.7-nearby-greeting-buff.md`](0.4.7-nearby-greeting-buff.md)
- [`0.4.8-shynok-food-buffs-mvp.md`](0.4.8-shynok-food-buffs-mvp.md)
- [`0.4.9-shynok-takeaway-consumables.md`](0.4.9-shynok-takeaway-consumables.md)
- [`0.4.10-shynok-resale-listings.md`](0.4.10-shynok-resale-listings.md)
- [`0.4.11-korchmar-recycling.md`](0.4.11-korchmar-recycling.md)
- [`0.4.12-guild-cosmetic-progression.md`](0.4.12-guild-cosmetic-progression.md)

These are planned contracts, not merged or deployed features.

## Shipped records and historical drafts

- `0.4.2` is the current repository release record; `0.4.1` is the previous
  release record.
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
