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

## Verified current task

The latest `origin/main` baseline verified on `12026-07-22` is
`3aa80b54`, package `0.3.17`. The next implementation is
[`0.4.0-party-vs-many-proof.md`](0.4.0-party-vs-many-proof.md).

Live GitHub state at that verification point:

- PR [#184](https://github.com/q587p/kvestarnia-bot/pull/184) uses
  `codex/0.4.0-party-vs-many-proof`, targets `main`, and remains open/unmerged.
- This is active work, not a merged release or proof of production deployment.

Do not edit the `0.4.0` task substance from repository-hygiene work.

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

- `0.3.17` is the current merged repository release record:
  [`0.3.17-callback-read-path-collapse.md`](0.3.17-callback-read-path-collapse.md).
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
