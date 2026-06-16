# Phase 2 — Remort at Level 13

`/remort` is the intended answer to «what happens after level 13?» once the current alpha cap becomes a real loop endpoint. It should feel like heroic reincarnation with jokes and memory, not a punishment and not paid power.

## Design goal

At level 13, a player can start a new cycle while preserving selected legacy:

- remort count;
- title, cosmetic mark or public identity note;
- public board memory;
- a small memory bonus tied to one developed stat, class/race identity or earned style;
- slightly better starting HP/mana for the new cycle;
- up to 5 explicitly selected eligible manatky;
- no runaway veteran power.

Legacy should be noticeable enough to feel like memory, not strong enough to replace normal progression, gear growth or fresh-player relevance. Every preserved benefit must be capped, transparent and weaker than simply leveling and finding better manatky in the new cycle.

`/restart` remains the hard reset/discovery command. `/remort` is a prestige loop with explicit confirmation.

## MVP flow

1. Hero reaches level 13.
2. Capstone copy points to `/remort` as the next long-term option.
3. `/remort` shows a reset/preserve preview: level/XP/current combat state reset, selected legacy kept.
4. Player explicitly selects up to 5 eligible manatky to preserve, or continues with none.
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

The runtime PR must define item eligibility before implementation:

- equipped, protected, story, quest, priceless and explicitly blocked manatky are not auto-preserved;
- if any protected/story/priceless exception is ever allowed, it needs explicit design text and tests before runtime;
- selected manatky must be shown by name before confirmation;
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
- Player can explicitly preserve up to 5 eligible manatky, with the selected names shown before confirm.
- Protected/story/priceless/equipped rules are explicit and tested.
- Remort record is idempotent; repeated confirm cannot duplicate remort count, legacy bonus, preserved manatky or rewards.
- `/restart` and `/remort` are explained as different actions.
- Player-facing text uses Квестарня’s comic tone without hiding consequences.
