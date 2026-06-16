# Phase 2 — Remort at Level 13

`/remort` is the intended answer to «what happens after level 13?» once the current alpha cap becomes a real loop endpoint. It should feel like heroic reincarnation with jokes and memory, not a punishment and not paid power.

## Design goal

At level 13, a player can start a new cycle while preserving selected legacy:

- remort count;
- title/cosmetic mark;
- public board memory;
- maybe a tiny non-combat convenience;
- no direct permanent combat snowball in the first slice.

`/restart` remains the hard reset/discovery command. `/remort` is a prestige loop with explicit confirmation.

## MVP flow

1. Hero reaches level 13.
2. Capstone copy points to `/remort` as the next long-term option.
3. `/remort` explains what resets and what stays.
4. Player confirms with a scary-clear button.
5. Service creates an idempotent remort record and resets the chosen character state.
6. Result shows the legacy mark and the new start.

## Non-goals

- no paid remort;
- no hidden wipe;
- no automatic remort;
- no permanent combat advantage that makes fresh players irrelevant;
- no new level 14-23 bracket in the same first slice.

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
- Clear confirmation before any reset.
- Repeated confirm cannot duplicate remort count or rewards.
- `/restart` and `/remort` are explained as different actions.
- Player-facing text uses Квестарня’s comic tone without hiding consequences.

