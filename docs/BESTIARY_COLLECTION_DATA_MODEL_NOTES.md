# Bestiary Collection Data Model Notes

## Principle

Collection rows are **projection / progress / audit data only**.

The source of truth for rewards stays in `daily_actions` or the future Hunt Contract Ledger. Collection must never become a second reward ledger.

## Possible models

### `hunt_contracts`

**Purpose**  
Represents a monster hunt contract as it was shown to a character.

**Key fields**

- `id`
- `character_id`
- `monster_id`
- `local_date` or `contract_day`
- `state` (`shown`, `accepted`, `expired`, `closed`)
- `rotation_key`
- `created_at`
- `updated_at`

**Idempotency keys**

- `hunt-contract:{characterId}:{monsterId}:{localDate}`

**Relation to ledger**

- If the future Hunt Contract Ledger already stores the live contract, this table can become a projection or alias.
- Do not duplicate reward amounts here.

**Source of truth**

- The future ledger row for the live contract.

**Migration concerns**

- if a contract can be reopened from history, keep only one canonical row;
- do not let `hunt_contracts` drift from the ledger state machine;
- be careful with unique constraints across retries and late callback replays.

**Backfill strategy**

- backfill from `daily_actions` only if the daily action record is the only historic proof of a hunt;
- do not synthesize contracts where no encounter was actually shown.

**Privacy / deletion**

- delete or cascade rows when a character resets;
- do not keep a public trail by default.

### `hunt_contract_resolutions`

**Purpose**  
Stores the fact that a contract reached a resolved action result.

**Key fields**

- `id`
- `hunt_contract_id`
- `character_id`
- `action_key`
- `resolution` (`strike`, `trick`, `retreat`, `inspect`, `other`)
- `result_state`
- `reward_replay_key`
- `resolved_at`
- `created_at`

**Idempotency keys**

- `hunt-resolution:{contractId}:{actionKey}`

**Relation to ledger**

- resolution rows should point to the canonical ledger / daily action result;
- they should not calculate new rewards.

**Source of truth**

- the ledger or `daily_actions` row for reward summary;
- this table is a history of how the player got there.

**Migration concerns**

- repeated callback handling must upsert or noop cleanly;
- avoid double resolution rows from stale buttons;
- beware of one character resolving the same visual contract twice across device refreshes.

**Backfill strategy**

- can be backfilled from existing reward or combat records if the contract state is known;
- otherwise leave empty and let future runtime create only new rows.

**Privacy / deletion**

- cascade on character reset;
- keep no orphaned action audit when the owning character disappears.

### `character_monster_notes`

**Purpose**  
Tracks what the character has learned or studied about a monster.

**Key fields**

- `id`
- `character_id`
- `monster_id`
- `seen_at`
- `encountered_at`
- `resolved_at`
- `studied_at`
- `note_state`
- `last_source`
- `created_at`
- `updated_at`

**Idempotency keys**

- `monster-note:{characterId}:{monsterId}`

**Relation to ledger**

- derive progression from ledger events;
- update only as a projection of actual seen/resolved/studied events.

**Source of truth**

- runtime events and ledger history, not manual edit.

**Migration concerns**

- this table should tolerate partial states;
- a monster may be `seen` without ever being `resolved`;
- do not force a fake resolution just to populate the note.

**Backfill strategy**

- optional backfill from `daily_actions`, existing hunt results, or historical `monsterFlavor` hooks if the runtime already stores enough evidence;
- if evidence is weak, prefer starting fresh.

**Privacy / deletion**

- delete with the character;
- if a player wipes their account, the learning trail should disappear too.

### `character_monster_trophies`

**Purpose**  
Tracks the connection between a character and a trophy item or trophy-like memory.

**Key fields**

- `id`
- `character_id`
- `monster_id`
- `item_id` or `trophy_key`
- `source_contract_id`
- `inspected_at`
- `created_at`

**Idempotency keys**

- `monster-trophy:{characterId}:{monsterId}:{itemId}`

**Relation to ledger**

- may reference a reward row or inventory projection;
- must not become a separate reward generator.

**Source of truth**

- the reward ledger for the item grant;
- inventory or item projection for ownership.

**Migration concerns**

- trophies may come from a runtime drop or a purely decorative memory;
- be clear whether the trophy is an item instance or only a record.

**Backfill strategy**

- if trophy ownership already exists in inventory, derive the trophy row from that;
- if not, leave it as a note-only projection.

**Privacy / deletion**

- delete or anonymize with character reset;
- no public trophy list unless the player explicitly opts in later.

## Recommended source-of-truth split

- `daily_actions` / future Hunt Contract Ledger: reward truth
- `hunt_contracts`: contract truth or projection
- `hunt_contract_resolutions`: action history
- `character_monster_notes`: progression / study projection
- `character_monster_trophies`: trophy projection or inventory link

## What not to do

- do not create a second reward source;
- do not duplicate XP/gold in collection tables as if they were independent currency flows;
- do not let collection tables decide combat or stat bonuses;
- do not mix public sharing state into core ownership rows;
- do not require a full rebuild of hunt history if the player only needs a journal screen.

## Backfill guidance from `daily_actions`

If the future ledger lands after some hunts already happened, backfill carefully:

- use the existing daily action or ledger row as the canonical event;
- derive collection states from actual recorded activity;
- mark only what can be proven;
- never backfill a `resolved` state when the record only proves `seen`.

## Suggested schema hygiene

- unique per character + monster, or character + monster + state transition, depending on event shape;
- timestamps should reflect the actual player event, not a later replay view;
- keep audit rows separate from projection rows if the runtime needs both.

## Suggested follow-up integration patch

When implementation starts, first align:

- ledger state machine;
- reward replay display;
- journal projection updates;
- character reset cleanup.

This keeps the collection layer honest and stops it from becoming an accidental second wallet.
