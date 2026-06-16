# Remort at Level 13

Status after `0.1.2`: the first runtime `/remort` loop exists. This document now records the shipped base rules and the future remort-only expansion direction.

`/remort` is the answer to «what happens after level 13?» now that the current alpha cap is a real loop endpoint. It should feel like heroic reincarnation with jokes and memory, not a punishment and not paid power.

## Design goal

At level 13, a player can start a new cycle while preserving selected legacy:

- remort count;
- title, cosmetic mark or public identity note;
- public board memory;
- a memory bonus tied to the previous life’s developed HP, mana and primary stat growth;
- better starting HP/mana for the new cycle;
- up to 5 explicitly selected owned manatky;
- no runaway veteran power.

Legacy should be noticeable enough to feel like memory, not strong enough to replace normal progression, gear growth or fresh-player relevance. Every preserved benefit must be transparent and weaker than simply leveling and finding better manatky in the new cycle; if it snowballs, tune it with visible rules rather than hidden deletion.

`/restart` remains the hard reset/discovery command. `/remort` is a prestige loop with explicit confirmation.

## Inspiration note: MUD remort pacing

Useful reference: [r/MUD discussion, «Does your MUD have Remort levels?»](https://www.reddit.com/r/MUD/comments/rpy6wt/does_your_mud_have_remort_levels/).

The part worth borrowing is not a specific system wholesale, but the pacing idea: remort can keep the same level range while making each new life a little heavier to climb. One comment describes a MUD where each remort adds «extra 200 xp per level» on top of a normal per-level cost. For Квестарня, a flat `+200 XP` per level would be too blunt and too large for the current 1-13 curve, but the principle is useful.

Runtime balance rule in `0.1.2`:

- first remort makes the next trip to level 13 meaningfully longer, not punitive;
- level 13 after one remort requires `1599 total XP` instead of `1300`;
- lower levels get the same simple proportional bump as the capstone;
- current formula for remort-adjusted total thresholds:

```text
remort_threshold(level, remort_count) =
  ceil(base_threshold(level) * (1 + 0.23 * remort_count))
```

This makes the first post-remort climb:

```text
level 1: 0
level 2: 13
level 3: 31
level 4: 56
level 5: 87
level 6: 136
level 7: 197
level 8: 277
level 9: 376
level 10: 554
level 11: 800
level 12: 1107
level 13: 1599
```

This is intentionally simple runtime math, not final prestige balance. After playtest fallout, run reward pacing and combat simulations so remort does not become either a trivial victory lap or a paper wall with candles.

## Shipped MVP flow

1. Hero reaches level 13.
2. Capstone copy points to `/remort` as the next long-term option.
3. `/remort` shows a reset/preserve preview: level/XP/current combat state reset, selected legacy kept.
4. Player explicitly selects up to 5 owned manatky to preserve, or continues with none.
5. Final confirmation shows the preserved list, legacy bonus and reset consequences.
6. Service creates an idempotent remort record and resets the chosen character state.
7. Repeated confirm replays the same remort result without adding count, bonus or items again.
8. Result shows the legacy mark and the new start.

## Shipped memory bonus

The first runtime memory bonus is intentionally simple:

```text
ceil(previous_level_growth_bonus * 0.23 * remort_number)
```

It applies to:

- HP gained from levels in the previous life;
- mana gained from levels in the previous life;
- the previous class’s primary stat growth.

Example: a first remort after level 13 keeps a memory of the 12 gained levels: `+12 HP`, `+6` mana and `+3` to the previous primary stat. The UI shows this as `Памʼять минулих пригод`, not as a public `x/5` cap.

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
