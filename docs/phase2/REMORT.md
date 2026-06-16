# Remort at Level 13

Status after `0.1.2`: the first runtime `/remort` loop exists. This document now records the shipped base rules and the future remort-only expansion direction.

`/remort` is the answer to «what happens after level 13?» now that the current alpha cap is a real loop endpoint. It should feel like heroic reincarnation with jokes and memory, not a punishment and not paid power.

## Design goal

At level 13, a player can start a new cycle while preserving selected legacy:

- remort count;
- title, cosmetic mark or public identity note;
- public board memory;
- a small memory bonus tied to one developed stat, class/race identity or earned style;
- slightly better starting HP/mana for the new cycle;
- up to 5 explicitly selected owned manatky;
- no runaway veteran power.

Legacy should be noticeable enough to feel like memory, not strong enough to replace normal progression, gear growth or fresh-player relevance. Every preserved benefit must be capped, transparent and weaker than simply leveling and finding better manatky in the new cycle.

`/restart` remains the hard reset/discovery command. `/remort` is a prestige loop with explicit confirmation.

## Shipped MVP flow

1. Hero reaches level 13.
2. Capstone copy points to `/remort` as the next long-term option.
3. `/remort` shows a reset/preserve preview: level/XP/current combat state reset, selected legacy kept.
4. Player explicitly selects up to 5 owned manatky to preserve, or continues with none.
5. Final confirmation shows the preserved list, legacy bonus and reset consequences.
6. Service creates an idempotent remort record and resets the chosen character state.
7. Repeated confirm replays the same remort result without adding count, bonus or items again.
8. Result shows the legacy mark and the new start.

## Non-goals

- no paid remort;
- no hidden wipe;
- no automatic remort;
- no runaway veteran power;
- no new level 14-23 bracket in the same first slice.

## Preserve rules

The current runtime carry-over rule is intentionally bold but explicit:

- known owned manatky are selectable, including equipped, effect-bearing, protected, story and priceless keepsakes;
- archived/unknown item ids must appear visibly as fallback «Архівна манатка» entries and count toward the same 5 selected item id limit; no hidden extra stacks are carried;
- the limit of 5 selected item ids is the first guardrail, not a promise that every future item will remain unrestricted forever;
- future rare/remort-only manatky can require remort count, level gates, tags or attunement if playtest shows power creep.
- selected manatky must be shown by name before confirmation;
- selected stacks preserve one unit per item id in this MVP, even when the current stack quantity is greater than 1;
- if inventory changes between preview and confirm, the confirm must revalidate and fail safely or replay the already completed result;
- `/restart` remains separate, destructive and should not silently share `/remort` preserve behavior.

## Data sketch

```text
character_remorts
- id
- character_id
- remort_number
- previous_level
- preserved_payload_json
- created_at
- unique (character_id, remort_number)
```

The exact reset/preserve list must be decided in the runtime PR and covered by tests.

## Acceptance criteria

- Unavailable below level 13.
- Reset/preserve preview appears before any reset.
- Clear confirmation before any reset.
- Player can explicitly preserve up to 5 owned manatky, with the selected names and one-unit semantics shown before confirm.
- Equipped/effect-bearing/protected/story/priceless carry-over rules are explicit and tested.
- Archived/unknown item ids are visible fallback choices, not invisible carry-over.
- Remort record is idempotent; repeated confirm cannot duplicate remort count, legacy bonus, preserved manatky or rewards.
- `/restart` and `/remort` are explained as different actions.
- Player-facing text uses Квестарня’s comic tone without hiding consequences.

## Future follow-ups

- Remort-only titles, cosmetic marks and richer board copy.
- Remort-only race/class flavor with no paid power and no veteran runaway.
- Rare manatky that require remort to equip, awaken or understand.
- Rename/identity polish only after separate user-generated-name moderation decisions.
- Stronger legacy mechanics only after playtest proves the base loop is fair.
